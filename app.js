let supabaseClient = null;

const demoAccounts = () => [
  {phone:"0820000001",password:"user123",role:"user",title:"Mr",name:"Demo User",points:150},
  {phone:"0820000002",password:"admin123",role:"admin",title:"Mr",name:"System Admin",points:0}
];

function phoneClean(v){ return v.replace(/\s+/g,""); }
function message(id,text,good=false){ const e=document.getElementById(id); if(!e)return; e.textContent=text; e.className="message "+(good?"success":""); }

async function doLogin(phone,password){
  phone=phoneClean(phone);
  if(SMARTBIN_CONFIG.USE_SUPABASE){
    const {data,error}=await supabaseClient.auth.signInWithPassword({phone,password});
    if(error)throw error;
    const {data:profile,error:pError}=await supabaseClient.from("profiles").select("*").eq("id",data.user.id).single();
    if(pError)throw pError;
    localStorage.setItem("smartbin_profile",JSON.stringify(profile));
    return profile;
  }
  let account=demoAccounts().find(a=>a.phone===phone&&a.password===password);
  if(!account){
    account=JSON.parse(localStorage.getItem("smartbin_demo_accounts")||"[]").find(a=>a.phone===phone&&a.password===password);
  }
  if(!account)throw new Error("Incorrect phone number or password.");
  localStorage.setItem("smartbin_profile",JSON.stringify(account));
  return account;
}

async function createAccount(account){
  if(SMARTBIN_CONFIG.USE_SUPABASE){
    const {data,error}=await supabaseClient.auth.signUp({
      phone:account.phone,password:account.password,
      options:{data:{title:account.title,name:account.name,role:"user"}}
    });
    if(error)throw error;
    if(!data.user)throw new Error("Account could not be created.");
    return;
  }
  const list=JSON.parse(localStorage.getItem("smartbin_demo_accounts")||"[]");
  if([...demoAccounts(),...list].some(a=>a.phone===account.phone))throw new Error("That phone number is already registered.");
  list.push({...account,role:"user",points:0});
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
    const phone=phoneClean(document.getElementById("phone").value),password=document.getElementById("password").value,confirm=document.getElementById("confirmPassword").value;
    if(!title||!name||!phone||!password)return message("message","Please complete all fields.");
    if(password!==confirm)return message("message","The passwords do not match.");
    if(!/^\+?[0-9]{9,15}$/.test(phone))return message("message","Please enter a valid phone number.");
    try{await createAccount({title,name,phone,password});message("message","Account created successfully. You can now log in.","success");setTimeout(()=>location.href="index.html",900);}
    catch(err){message("message",err.message||"Could not create account.");}
  });

  const profile=JSON.parse(localStorage.getItem("smartbin_profile")||"null");
  if(document.body.classList.contains("dash")){
    if(!profile){location.href="index.html";return;}
    const admin=location.pathname.endsWith("admin.html");
    if(admin&&profile.role!=="admin"){location.href="user.html";return;}
    if(!admin&&profile.role==="admin"){location.href="admin.html";return;}
    if(document.getElementById("welcomeName"))document.getElementById("welcomeName").textContent=profile.title+" "+profile.name;
    if(document.getElementById("userName"))document.getElementById("userName").textContent=profile.title+" "+profile.name;
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