import {useEffect,useRef,useState,type FormEvent,type ReactNode} from 'react';
import './accounts.css';

export type PlayerAccount={id:string;email:string;displayName:string;clan:number;clanName:string;owner:boolean};
// Present only when the server uses personal accounts. Absent means the original shared clan keys.
export type AccountSession={account:PlayerAccount;clans:string[];signOut:()=>Promise<void>};
type ServerState={mode:'keys'|'accounts';setupRequired?:boolean;setupAvailable?:boolean;clans?:string[];account?:PlayerAccount|null};
type Player={id:string;email:string;displayName:string;clan:number;owner:boolean;disabled:boolean;created:string};
type Invitation={id:string;clan:number;note:string;created:string;expires:string;status:string};

export async function accountRequest(path:string,body?:unknown,method=body===undefined?'GET':'POST'){
 const res=await fetch('/api/'+path,{method,credentials:'same-origin',headers:method==='GET'?{}:{'Content-Type':'application/json','X-Deepfield-Request':'1'},body:method==='GET'?undefined:JSON.stringify(body??{})});
 if(!res.ok){
  const fallback=res.status===429?'Too many attempts. Wait a minute and try again.':'Request failed ('+res.status+').';
  const result=await res.json().catch(()=>({error:fallback}));
  throw new Error(result?.error??fallback);
 }
 return res.json();
}
function linkToken(kind:'invite'|'reset'){const match=new RegExp('^#'+kind+'=([A-Za-z0-9_-]{20,100})$').exec(window.location.hash);return match?match[1]:null;}
function clearLink(){history.replaceState(null,'',window.location.pathname+window.location.search);}

function Frame({children}:{children:ReactNode}){
 return <main className="login"><div className="brand">✦ DEEPFIELD <span>CAMPAIGN 001</span></div><div className="eyebrow">A GALAXY BUILT TOGETHER</div><h1>Small beginnings.<br/><em>Galactic ambitions.</em></h1>{children}</main>;
}
function PasswordFields({password,setPassword,confirm,setConfirm,busy,label='Password'}:{password:string;setPassword:(v:string)=>void;confirm:string;setConfirm:(v:string)=>void;busy:boolean;label?:string}){
 return <><label>{label}<input type="password" disabled={busy} value={password} onChange={e=>setPassword(e.target.value)} required minLength={10} maxLength={200} autoComplete="new-password"/></label>
  <label>Repeat password<input type="password" disabled={busy} value={confirm} onChange={e=>setConfirm(e.target.value)} required minLength={10} maxLength={200} autoComplete="new-password"/></label>
  <small className="accountHint">At least 10 characters. A few unrelated words work well.</small></>;
}

export function AccountGate({children}:{children:(session:AccountSession|null)=>ReactNode}){
 const [state,setState]=useState<ServerState|null>(null),[account,setAccount]=useState<PlayerAccount|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [invite,setInvite]=useState<string|null>(()=>linkToken('invite')),[reset,setReset]=useState<string|null>(()=>linkToken('reset'));
 const [invitedClan,setInvitedClan]=useState<string|null>(null);
 const [email,setEmail]=useState(''),[name,setName]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[setupKey,setSetupKey]=useState(''),[clan,setClan]=useState(0);
 useEffect(()=>{
  let alive=true;
  // A server without this endpoint, or one that answers "keys", uses the original clan-key sign-in.
  fetch('/api/public/state',{credentials:'same-origin'}).then(res=>res.ok?res.json():{mode:'keys'}).catch(()=>({mode:'keys'})).then((result:ServerState)=>{
   if(!alive)return;setState(result);setAccount(result.account??null);
  });
  return ()=>{alive=false;};
 },[]);
 useEffect(()=>{
  if(!invite||state?.mode!=='accounts')return;
  let alive=true;
  accountRequest('public/invitation',{token:invite}).then(result=>{if(alive)setInvitedClan(result.clanName);}).catch(e=>{if(alive){setInvite(null);clearLink();setError(e instanceof Error?e.message:'Invitation not valid.');}});
  return ()=>{alive=false;};
 },[invite,state?.mode]);
 async function submit(event:FormEvent,action:()=>Promise<{account:PlayerAccount}>){
  event.preventDefault();if(busy)return;
  if((invite||reset||state?.setupRequired)&&password!==confirm){setError('The two passwords do not match.');return;}
  setBusy(true);setError('');setNotice('');
  try{const result=await action();clearLink();setInvite(null);setReset(null);setPassword('');setConfirm('');setSetupKey('');setState(current=>current?{...current,setupRequired:false}:current);setAccount(result.account);}
  catch(e){setError(e instanceof Error?e.message:'Request failed.');}
  finally{setBusy(false);}
 }
 if(!state)return <Frame><p role="status">Contacting the command deck…</p></Frame>;
 if(state.mode!=='accounts')return <>{children(null)}</>;
 if(account&&!invite&&!reset)return <>{children({account,clans:state.clans??[],signOut:async()=>{try{await accountRequest('account/logout',{});}catch{/* The local session ends either way. */}setAccount(null);setNotice('You are signed out.');}})}</>;
 const alert=error&&<p role="alert" className="error">{error}</p>;
 if(state.setupRequired)return <Frame><p>This campaign has no owner yet. Create the owner account with the setup key from the server configuration.</p>
  {state.setupAvailable?<form onSubmit={e=>void submit(e,()=>accountRequest('public/setup',{setupKey,email,displayName:name,password,clan}))}>
   <label>Setup key<input type="password" disabled={busy} value={setupKey} onChange={e=>setSetupKey(e.target.value)} required autoComplete="off"/></label>
   <label>Email<input type="email" disabled={busy} value={email} onChange={e=>setEmail(e.target.value)} required maxLength={254} autoComplete="username"/></label>
   <label>Display name<input disabled={busy} value={name} onChange={e=>setName(e.target.value)} required maxLength={40} autoComplete="nickname"/></label>
   <label>Your clan<select disabled={busy} value={clan} onChange={e=>setClan(Number(e.target.value))}>{(state.clans??[]).map((clanName,i)=><option key={i} value={i}>{clanName}</option>)}</select></label>
   <PasswordFields password={password} setPassword={setPassword} confirm={confirm} setConfirm={setConfirm} busy={busy}/>
   <button disabled={busy}>Create owner account →</button></form>:<p role="alert" className="error">Owner setup is not configured on this server. Set Owner__SetupKey (at least 24 characters) and restart.</p>}
  {alert}</Frame>;
 if(invite)return <Frame><p>{invitedClan?<>You are invited to join <strong>{invitedClan}</strong>. Create your account to take your seat.</>:'Checking your invitation…'}</p>
  <form onSubmit={e=>void submit(e,()=>accountRequest('public/accept',{token:invite,email,displayName:name,password}))}>
   <label>Email<input type="email" disabled={busy} value={email} onChange={e=>setEmail(e.target.value)} required maxLength={254} autoComplete="username"/></label>
   <label>Display name<input disabled={busy} value={name} onChange={e=>setName(e.target.value)} required maxLength={40} autoComplete="nickname" placeholder="Shown to your clan"/></label>
   <PasswordFields password={password} setPassword={setPassword} confirm={confirm} setConfirm={setConfirm} busy={busy}/>
   <button disabled={busy||!invitedClan}>Join the clan →</button></form>{alert}
  <button type="button" className="quiet" onClick={()=>{clearLink();setInvite(null);setError('');}}>I already have an account</button></Frame>;
 if(reset)return <Frame><p>Choose a new password. This link works once.</p>
  <form onSubmit={e=>void submit(e,()=>accountRequest('public/reset',{token:reset,password}))}>
   <PasswordFields password={password} setPassword={setPassword} confirm={confirm} setConfirm={setConfirm} busy={busy} label="New password"/>
   <button disabled={busy}>Set password and sign in →</button></form>{alert}
  <button type="button" className="quiet" onClick={()=>{clearLink();setReset(null);setError('');}}>Back to sign in</button></Frame>;
 return <Frame><p>Rally your clan. Chart the dark. Build a civilization that can harness the stars.</p>
  <form onSubmit={e=>void submit(e,()=>accountRequest('public/login',{email,password}))}>
   <label>Email<input type="email" disabled={busy} value={email} onChange={e=>setEmail(e.target.value)} required maxLength={254} autoComplete="username"/></label>
   <label>Password<input type="password" disabled={busy} value={password} onChange={e=>setPassword(e.target.value)} required maxLength={200} autoComplete="current-password"/></label>
   <button disabled={busy}>Sign in →</button></form>{alert}{notice&&<p role="status" className="notice">{notice}</p>}
  <small>New players join with an invitation link from the campaign owner. Forgot your password? Ask the owner for a reset link.</small></Frame>;
}

function shareLink(kind:'invite'|'reset',token:string){return window.location.origin+'/#'+kind+'='+token;}

// Owner-only: invite players, see who has joined, and manage access.
export function PlayersDialog({session,onClose}:{session:AccountSession;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 const [players,setPlayers]=useState<Player[]>([]),[invitations,setInvitations]=useState<Invitation[]>([]);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[clan,setClan]=useState(0),[note,setNote]=useState('');
 const [link,setLink]=useState<{label:string;url:string}|null>(null),[copied,setCopied]=useState(false);
 async function load(){const result=await accountRequest('admin/players');setPlayers(result.players);setInvitations(result.invitations);}
 async function run(action:()=>Promise<void>){if(busy)return;setBusy(true);setError('');try{await action();await load();}catch(e){setError(e instanceof Error?e.message:'Request failed.');}finally{setBusy(false);}}
 useEffect(()=>{dialog.current?.showModal();void run(async()=>{});},[]);
 const open=invitations.filter(i=>i.status==='open');
 return <dialog ref={dialog} className="planetDialog playersDialog" aria-labelledby="players-title" onClose={onClose} onCancel={onClose}>
  <div className="playersBody"><div className="panelTitle"><h2 id="players-title">Players and invitations</h2><button type="button" className="quiet" onClick={onClose}>Close</button></div>
   {error&&<p role="alert" className="error">{error}</p>}
   <form className="inviteForm" onSubmit={e=>{e.preventDefault();void run(async()=>{const result=await accountRequest('admin/invitations',{clan,note});setCopied(false);setLink({label:'Invitation link for '+session.clans[clan]+(note?' ('+note+')':''),url:shareLink('invite',result.token)});setNote('');});}}>
    <label>Invite to clan<select disabled={busy} value={clan} onChange={e=>setClan(Number(e.target.value))}>{session.clans.map((clanName,i)=><option key={i} value={i}>{clanName}</option>)}</select></label>
    <label>Note for yourself (optional)<input disabled={busy} value={note} onChange={e=>setNote(e.target.value)} maxLength={80} placeholder="Who is this for?"/></label>
    <button disabled={busy}>Create invitation link</button></form>
   {link&&<div className="shareLink" role="status"><strong>{link.label}</strong><p>Send this link privately. It is shown only now, and works once.</p>
    <input readOnly aria-label="Link to share" value={link.url} onFocus={e=>e.currentTarget.select()}/>
    <button type="button" onClick={()=>{void navigator.clipboard?.writeText(link.url).then(()=>setCopied(true)).catch(()=>setCopied(false));}}>{copied?'Copied':'Copy link'}</button></div>}
   <div className="panelTitle"><h3>Players</h3><button type="button" className="quiet" disabled={busy} onClick={()=>void run(async()=>{})}>Refresh list</button></div>
   <ul className="playerList">{players.map(player=><li key={player.id} data-player={player.email}>
    <div><strong>{player.displayName}</strong>{player.owner&&<span className="playerTag">Owner</span>}{player.disabled&&<span className="playerTag off">Disabled</span>}<br/><small>{player.email}</small></div>
    <label>Clan<select aria-label={'Clan for '+player.displayName} disabled={busy} value={player.clan} onChange={e=>{const next=Number(e.target.value);void run(()=>accountRequest('admin/players/'+player.id+'/clan',{clan:next}));}}>{session.clans.map((clanName,i)=><option key={i} value={i}>{clanName}</option>)}</select></label>
    {!player.owner&&<div className="playerActions">
     <button type="button" className="quiet" disabled={busy||player.disabled} onClick={()=>void run(async()=>{const result=await accountRequest('admin/players/'+player.id+'/reset',{});setCopied(false);setLink({label:'Password reset link for '+player.displayName,url:shareLink('reset',result.token)});})}>Reset link</button>
     <button type="button" className="quiet" disabled={busy} onClick={()=>void run(()=>accountRequest('admin/players/'+player.id+(player.disabled?'/enable':'/disable'),{}))}>{player.disabled?'Enable':'Disable'}</button></div>}
   </li>)}</ul>
   <h3>Open invitations</h3>
   {open.length===0?<p className="empty">No open invitations.</p>:<ul className="playerList">{open.map(invitation=><li key={invitation.id}>
    <div><strong>{session.clans[invitation.clan]}</strong>{invitation.note&&<> · {invitation.note}</>}<br/><small>Expires {new Date(invitation.expires).toLocaleDateString()}</small></div>
    <button type="button" className="quiet" disabled={busy} onClick={()=>void run(()=>accountRequest('admin/invitations/'+invitation.id+'/revoke',{}))}>Revoke</button></li>)}</ul>}
  </div></dialog>;
}
