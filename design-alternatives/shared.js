const AGENTS=[
{n:"Market landscape",d:"Mapping competitors and emerging product shifts",s:"Cross-checking pricing models",c:3.84,p:62,st:"working",t:[3,4]},
{n:"Protocol research",d:"Evaluating implementation patterns and security assumptions",s:"Testing protocol assumptions",c:2.17,p:43,st:"working",t:[1,4]},
{n:"Dataset synthesis",d:"Comparing public datasets and source reliability",s:"Waiting for dataset permission",c:1.62,p:55,st:"waiting",t:[2,4],q:"May I read the licensed benchmark dataset?",o:["Allow once","Allow for mission","Deny"]},
{n:"Literature review",d:"Extracting evidence across academic and industry publications",s:"Grouping evidence clusters",c:5.31,p:78,st:"working",t:[3,4]},
{n:"Risk assessment",d:"Identifying unresolved assumptions and potential failure modes",s:"Waiting for risk tolerance",c:.98,p:35,st:"waiting",t:[2,4],q:"Which risk profile should the analysis optimize for?",o:["Conservative","Balanced","Exploratory"]},
{n:"Executive briefing",d:"Turning research findings into a decision-ready summary",s:"Drafting key takeaways",c:1.48,p:82,st:"working",t:[3,4]}];
const LBL={working:"IN PROGRESS",waiting:"NEEDS YOU",done:"COMPLETE"};
const usd=v=>"$"+v.toFixed(2);
const pill=a=>`<span class="status ${a.st}">${LBL[a.st]}</span>`;
const total=AGENTS.reduce((s,a)=>s+a.c,0), waiting=AGENTS.filter(a=>a.st==="waiting");
const rail=`<nav class="rail"><div class="logo">xe</div>
<button class="nav active"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/></svg></button>
<button class="nav"><svg viewBox="0 0 24 24"><circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></svg><span class="num">${waiting.length}</span></button>
<button class="nav"><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 12h5l5-7M12 12l5 7"/></svg></button>
<button class="nav"><svg viewBox="0 0 24 24"><path d="M4 18V9m5 9V5m5 13v-8m5 8V3"/></svg></button></nav>`;
document.getElementById("shell").insertAdjacentHTML("afterbegin",rail);

function fit(){const s=innerWidth/1920,sh=document.getElementById("shell");sh.style.transform=`scale(${s})`;document.body.style.height=540*s+"px";}
addEventListener("resize",fit);fit();
