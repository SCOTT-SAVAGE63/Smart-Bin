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
    profile.points = profile.total_points;   // normalize field name for the rest of the UI
    profile.title = profile.title || "";
    profile.name = profile.full_name;
    localStorage.setItem("smartbin_profile",JSON.stringify(profile));
    return profile;
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

document.addEventListener("DOMContentLoaded",()=>{
  if(typeof supabase!=="undefined" && SMARTBIN_CONFIG.USE_SUPABASE){
    supabaseClient=supabase.createClient(SMARTBIN_CONFIG.SUPABASE_URL,SMARTBIN_CONFIG.SUPABASE_PUBLISHABLE_KEY);
  }

  const lf=document.getElementById("loginForm");
  if(lf)lf.addEventListener("submit",async e=>{
    e.preventDefault();
    try{
      const p=await doLogin(document.getElementById("phone").value,document.getElementById("password").value);
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
    if(document.getElementById("profilePhone"))document.getElementById("profilePhone").textContent=profile.phone;
  }

  const logout=document.getElementById("logoutBtn");
  if(logout)logout.onclick=async()=>{if(supabaseClient)await supabaseClient.auth.signOut();localStorage.removeItem("smartbin_profile");location.href="index.html";};

  if(document.getElementById("claimPoints")){
    const q=new URLSearchParams(location.search);
    document.getElementById("claimPoints").textContent=q.get("points")||"30";
    document.getElementById("claimDetails").textContent=(q.get("material")||"Can")+" · "+(q.get("bin")||"SB001")+" · "+(q.get("location")||"Rustenburg");
  }
});
