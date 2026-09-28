let supabaseClient = null;

const demoAccounts = () => [
  {phone:"0820000001",password:"user123",role:"user",title:"Mr",name:"Demo User",points:150},
  {phone:"0820000002",password:"admin123",role:"admin",title:"Mr",name:"System Admin",points:0}
];

function phoneClean(v){ return v.replace(/\s+/g,""); }

// Local South African numbers are usually typed starting with 0.
// Convert to international format: 0821234567 -> +27821234567
function phoneToE164(v){
  const cleaned = phoneClean(v);
  if(cleaned.startsWith("+")) return cleaned;
  if(cleaned.startsWith("0")) return "+27"+cleaned.slice(1);
  return "+"+cleaned;
}

// Supabase logs in with email + password (no SMS setup needed), so the
// phone number is turned into an email-style ID: 27821234567@domain
function phoneToEmail(v){
  const digits = phoneToE164(v).replace("+","");
  return digits+"@"+SMARTBIN_CONFIG.PHONE_EMAIL_DOMAIN;
}


const TITLES=["Mr","Mrs","Ms","Miss","Dr","Prof"];

// The database stores one full_name like "Mr Test User" - split the title back out.
function normalizeProfile(row){
  const full=(row.full_name||"").trim();
  const first=full.split(" ")[0];
  const hasTitle=TITLES.includes(first);
  return {...row,points:row.total_points,title:hasTitle?first:"",name:hasTitle?full.slice(first.length).trim():full};
}

// +27821234567 -> 0821234567
function phoneForDisplay(p){ return p&&p.startsWith("+27")?"0"+p.slice(3):(p||""); }

function setText(id,text){ const e=document.getElementById(id); if(e)e.textContent=text; }
function el(tag,cls,text){ const e=document.createElement(tag); if(cls)e.className=cls; if(text!==undefined)e.textContent=text; return e; }

function message(id,text,good=false){ const e=document.getElementById(id); if(!e)return; e.textContent=text; e.className="message "+(good?"success":""); }

async function doLogin(phone,password){
  if(SMARTBIN_CONFIG.USE_SUPABASE){
    const {data,error}=await supabaseClient.auth.signInWithPassword({email:phoneToEmail(phone),password});
    if(error){
      if(/invalid login/i.test(error.message))throw new Error("Incorrect phone number or password.");
      throw error;
    }
    const {data:profile,error:pError}=await supabaseClient.from("profiles").select("*").eq("id",data.user.id).single();
    if(pError)throw pError;
    const normalized=normalizeProfile(profile);
    localStorage.setItem("smartbin_profile",JSON.stringify(normalized));
    return normalized;
  }
  const cleanedPhone=phoneClean(phone);
  let account=demoAccounts().find(a=>a.phone===cleanedPhone&&a.password===password);
  if(!account){
    account=JSON.parse(localStorage.getItem("smartbin_demo_accounts")||"[]").find(a=>a.phone===cleanedPhone&&a.password===password);
  }
  if(!account)throw new Error("Incorrect phone number or password.");
  localStorage.setItem("smartbin_profile",JSON.stringify(account));
  return account;
}

async function createAccount(account){
  if(SMARTBIN_CONFIG.USE_SUPABASE){
    const {data,error}=await supabaseClient.auth.signUp({
      email:phoneToEmail(account.phone),
      password:account.password,
      options:{data:{full_name:account.title+" "+account.name,phone:phoneToE164(account.phone)}}
    });
    if(error){
      if(/already registered/i.test(error.message))throw new Error("That phone number is already registered.");
      throw error;
    }
    if(!data.user)throw new Error("Account could not be created.");
    await supabaseClient.auth.signOut();   // make them log in properly after registering
    return;
  }
  const cleanedPhone=phoneClean(account.phone);
  const list=JSON.parse(localStorage.getItem("smartbin_demo_accounts")||"[]");
  if([...demoAccounts(),...list].some(a=>a.phone===cleanedPhone))throw new Error("That phone number is already registered.");
  list.push({...account,phone:cleanedPhone,role:"user",points:0});
  localStorage.setItem("smartbin_demo_accounts",JSON.stringify(list));
}


async function loadUserDashboard(profile){
  try{
    // Fresh profile (points may have changed since login)
    const {data:fresh}=await supabaseClient.from("profiles").select("*").eq("id",profile.id).single();
    let points=profile.points||0;
    if(fresh){
      const n=normalizeProfile(fresh);
      localStorage.setItem("smartbin_profile",JSON.stringify(n));
      points=n.points;
      setText("pointsBalance",points);
      setText("profileTitle",n.title||"-");
      setText("profileName",n.name);
      setText("profilePhone",phoneForDisplay(n.phone));
    }

    // Recycling history + session count
    const {data:events,count,error:evError}=await supabaseClient
      .from("recycling_events")
      .select("waste_type,points_earned,created_at,bins(bin_code)",{count:"exact"})
      .eq("user_id",profile.id)
      .order("created_at",{ascending:false})
      .limit(10);
    if(evError)throw evError;
    setText("sessionCount",count??0);
    const hist=document.getElementById("historyList");
    if(hist){
      hist.replaceChildren();
      if(!events||!events.length){
        hist.appendChild(el("p","muted","No recycling yet. Your sessions will appear here."));
      }else{
        events.forEach(ev=>{
          const when=new Date(ev.created_at).toLocaleDateString("en-ZA",{day:"numeric",month:"short"});
          const row=el("div","history");
          row.appendChild(el("b","",ev.waste_type==="can"?"🥫 Can recycled":"📄 Paper recycled"));
          row.appendChild(el("span","",when+" · "+((ev.bins&&ev.bins.bin_code)||"")));
          row.appendChild(el("strong","","+"+ev.points_earned));
          hist.appendChild(row);
        });
      }
    }

    // Rewards
    const {data:rewards,error:rwError}=await supabaseClient
      .from("rewards").select("name,points_required").eq("active",true).order("points_required");
    if(rwError)throw rwError;
    const list=document.getElementById("rewardsList");
    if(list){
      list.replaceChildren();
      if(!rewards||!rewards.length){
        list.appendChild(el("p","muted","No rewards available yet."));
      }else{
        rewards.forEach(r=>{
          const row=el("div","row");
          row.appendChild(el("i","",(r.name.match(/^R\d+/)||[r.name.slice(0,3)])[0]));
          const info=el("div");
          info.appendChild(el("b","",r.name));
          const need=r.points_required-points;
          info.appendChild(el("small","",r.points_required+" points"+(need>0?" · "+need+" more needed":"")));
          row.appendChild(info);
          const btn=el("button","","CLAIM");
          btn.disabled=true;            // claiming is not built yet
          btn.title="Reward claiming is coming soon";
          row.appendChild(btn);
          list.appendChild(row);
        });
      }
    }
  }catch(err){
    console.error(err);
    const hist=document.getElementById("historyList");
    if(hist)hist.replaceChildren(el("p","muted","Could not load your data: "+(err.message||err)));
  }
}


async function initClaimPage(){
  const token=new URLSearchParams(location.search).get("t");
  const actions=document.getElementById("claimActions");
  const setIntro=(title,text)=>{setText("claimTitle",title);setText("claimText",text);};
  const addLink=(href,label,cls)=>{const a=el("a",cls,label);a.href=href;actions.appendChild(a);};

  if(!SMARTBIN_CONFIG.USE_SUPABASE||!supabaseClient){setIntro("Unavailable","This page needs the live system.");return;}
  if(!token){setIntro("Link problem","This claim link is missing its code. Please scan the QR code on the bin again.");return;}

  const {data:{session}}=await supabaseClient.auth.getSession();
  if(!session){
    sessionStorage.setItem("smartbin_after_login",location.href);
    setIntro("Your points are waiting","Log in or create an account to claim them.");
    addLink("index.html","LOG IN & CLAIM","button");
    addLink("register.html","CREATE ACCOUNT","secondary");
    return;
  }

  setIntro("Claim your points","Tap below to add this recycling session to your account.");
  const btn=el("button","button","CLAIM POINTS");
  actions.appendChild(btn);
  btn.onclick=async()=>{
    btn.disabled=true;btn.textContent="Claiming...";
    const {data,error}=await supabaseClient.rpc("claim_recycling_session",{p_token:token});
    if(error){
      btn.disabled=false;btn.textContent="TRY AGAIN";
      setIntro("Could not claim",error.message);
      return;
    }
    actions.replaceChildren();
    setIntro("Points added!","Thank you for recycling.");
    setText("claimPoints","+"+data.points_earned);
    setText("claimDetails","New balance: "+data.total_points+" points");
    document.getElementById("claimResult").classList.remove("hidden");
    addLink("user.html","VIEW MY ACCOUNT","button");
  };
}

document.addEventListener("DOMContentLoaded",()=>{
  if(typeof supabase!=="undefined" && SMARTBIN_CONFIG.USE_SUPABASE){
    supabaseClient=supabase.createClient(SMARTBIN_CONFIG.SUPABASE_URL,SMARTBIN_CONFIG.SUPABASE_PUBLISHABLE_KEY);
  }

  const lf=document.getElementById("loginForm");
  if(lf)lf.addEventListener("submit",async e=>{
    e.preventDefault();
    try{
      const p=await doLogin(document.getElementById("phone").value,document.getElementById("password").value);
      const after=sessionStorage.getItem("smartbin_after_login");
      sessionStorage.removeItem("smartbin_after_login");
      if(after&&after.startsWith(location.origin)&&after.includes("claim.html")){location.href=after;return;}
      location.href=p.role==="admin"?"admin.html":"user.html";
    }catch(err){message("message",err.message||"Login failed.");}
  });

  const rf=document.getElementById("registerForm");
  if(rf)rf.addEventListener("submit",async e=>{
    e.preventDefault();
    const title=document.getElementById("title").value,name=document.getElementById("name").value.trim();
    const phone=document.getElementById("phone").value,password=document.getElementById("password").value,confirm=document.getElementById("confirmPassword").value;
    if(!title||!name||!phone||!password)return message("message","Please complete all fields.");
    if(password!==confirm)return message("message","The passwords do not match.");
    if(!/^\+?[0-9]{9,15}$/.test(phoneClean(phone)))return message("message","Please enter a valid phone number.");
    try{await createAccount({title,name,phone,password});message("message","Account created successfully. You can now log in.","success");setTimeout(()=>location.href="index.html",900);}
    catch(err){message("message",err.message||"Could not create account.");}
  });

  const profile=JSON.parse(localStorage.getItem("smartbin_profile")||"null");
  if(document.body.classList.contains("dash")){
    if(!profile){location.href="index.html";return;}
    const admin=location.pathname.endsWith("admin.html");
    if(admin&&profile.role!=="admin"){location.href="user.html";return;}
    if(!admin&&profile.role==="admin"){location.href="admin.html";return;}
    const shownName=((profile.title?profile.title+" ":"")+profile.name).trim();
    if(document.getElementById("welcomeName"))document.getElementById("welcomeName").textContent=shownName;
    if(document.getElementById("userName"))document.getElementById("userName").textContent=shownName;
    if(document.getElementById("pointsBalance"))document.getElementById("pointsBalance").textContent=profile.points||0;
    if(document.getElementById("profileTitle"))document.getElementById("profileTitle").textContent=profile.title;
    if(document.getElementById("profileName"))document.getElementById("profileName").textContent=profile.name;
    if(document.getElementById("profilePhone"))document.getElementById("profilePhone").textContent=phoneForDisplay(profile.phone);
    if(!admin&&SMARTBIN_CONFIG.USE_SUPABASE&&supabaseClient)loadUserDashboard(profile);
  }

  const logout=document.getElementById("logoutBtn");
  if(logout)logout.onclick=async()=>{if(supabaseClient)await supabaseClient.auth.signOut();localStorage.removeItem("smartbin_profile");location.href="index.html";};

  if(document.getElementById("claimActions"))initClaimPage();
});
