(()=>{"use strict";
const API="https://visitor-indexer.aryanavery1488.workers.dev",KEY="visitor_index_id_v1";
const uid=()=>crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2);
let vid;try{vid=localStorage.getItem(KEY)||"v_"+uid();localStorage.setItem(KEY,vid)}catch(_){vid="v_"+uid()}
const sid="s_"+uid(),ua=navigator.userAgentData||null,cn=navigator.connection||null;
const clean=v=>{try{let u=new URL(v,location.href);return u.origin+u.pathname+(u.hash||"")}catch(_){return null}};
const meta={
device:{platform:ua?.platform||navigator.platform||null,vendor:navigator.vendor||null,hardware_concurrency:navigator.hardwareConcurrency||null,device_memory_gb:navigator.deviceMemory||null,max_touch_points:navigator.maxTouchPoints||0,cookie_enabled:!!navigator.cookieEnabled,online:navigator.onLine},
browser:{user_agent:navigator.userAgent||null,brands:ua?.brands||null,mobile_hint:typeof ua?.mobile==="boolean"?ua.mobile:null,do_not_track:navigator.doNotTrack||null},
display:{screen_width:screen.width||null,screen_height:screen.height||null,available_width:screen.availWidth||null,available_height:screen.availHeight||null,viewport_width:innerWidth,viewport_height:innerHeight,pixel_ratio:devicePixelRatio||1,color_depth:screen.colorDepth||null,orientation:screen.orientation?.type||null},
locale:{language:navigator.language||null,languages:(navigator.languages||[]).slice(0,10),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||null,timezone_offset_minutes:new Date().getTimezoneOffset()},
connection:cn?{effective_type:cn.effectiveType||null,downlink_mbps:cn.downlink||null,rtt_ms:cn.rtt||null,save_data:!!cn.saveData}:null};
const base={visitor_id:vid,session_id:sid,first_party_notice:true};
function send(path,obj){return fetch(API+path,{method:"POST",mode:"cors",credentials:"omit",cache:"no-store",keepalive:true,headers:{"Content-Type":"application/json"},body:JSON.stringify({...base,...obj})}).catch(()=>null)}
let page=clean(location.href),started=Date.now();
const visit=send("/api/visit",{page,referrer:clean(document.referrer),language:navigator.language,timezone:meta.locale.timezone,screen:{width:screen.width,height:screen.height},metadata:meta});
window.__visitorTrackingPromise=visit;
function event(type,details={},duration=null){send("/api/event",{event_type:type,page:clean(location.href),duration_ms:duration,details})}
event("page_view",{title:document.title.slice(0,180)});
function end(){event("page_exit",{},Math.min(86400000,Math.max(0,Date.now()-started)))}
addEventListener("pagehide",end);addEventListener("hashchange",()=>{end();started=Date.now();event("page_view",{title:document.title.slice(0,180)})});
document.addEventListener("visibilitychange",()=>event(document.visibilityState==="hidden"?"tab_hidden":"tab_visible"));
document.addEventListener("click",e=>{const el=e.target?.closest?.("button,a,[role=button]");if(!el)return;const label=(el.getAttribute("aria-label")||el.getAttribute("data-action")||el.id||el.textContent||"").trim().replace(/\s+/g," ").slice(0,100);if(label)event("ui_click",{control:el.tagName.toLowerCase(),label})},true);
addEventListener("error",e=>{const x=e.target;if(x&&x!==window){let resource=null;try{const u=new URL(x.src||x.href,location.href);resource=u.origin+u.pathname}catch(_){}event("resource_error",{resource})}else event("javascript_error",{message:String(e.message||"Script error").slice(0,240),file:clean(e.filename||"")})},true);
addEventListener("unhandledrejection",e=>event("unhandled_rejection",{message:String(e.reason?.message||e.reason||"Unhandled rejection").slice(0,240)}));
if(ua?.getHighEntropyValues)ua.getHighEntropyValues(["architecture","bitness","model","platformVersion","uaFullVersion"]).then(v=>event("browser_details",v)).catch(()=>{});
})();