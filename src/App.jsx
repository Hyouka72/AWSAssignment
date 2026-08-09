import React, {useEffect,useMemo,useState} from "react";
import {Activity,AlertCircle,CalendarDays,Droplet,Edit3,Eye,Loader2,MapPin,Phone,Plus,RefreshCw,Search,Trash2,UserRound,X} from "lucide-react";

const API_BASE=(import.meta.env.VITE_API_BASE_URL||"").replace(/\/+$/,"");
const API_URL=`${API_BASE}/donor`;
const emptyForm={donorId:"",name:"",bloodGroup:"",age:"",gender:"",phone:"",email:"",address:"",city:"",lastDonationDate:""};
const bloodGroups=["A+","A-","B+","B-","AB+","AB-","O+","O-"];

async function api(path="",options={}){
  const r=await fetch(`${API_URL}${path}`,{...options,headers:{"Content-Type":"application/json",...(options.headers||{})}});
  const text=await r.text(); let data={};
  try{data=text?JSON.parse(text):{}}catch{data={message:text}}
  if(!r.ok)throw new Error(data.message||data.error||`Request failed (${r.status})`);
  return data;
}

function Modal({title,children,onClose}){
 return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" onMouseDown={e=>e.stopPropagation()}>
  <div className="modal-header"><div><h2>{title}</h2><p>Manage donor information securely.</p></div><button className="icon-button" onClick={onClose}><X size={20}/></button></div>{children}
 </div></div>
}
function DonorForm({initial,editing,saving,onCancel,onSubmit}){
 const [form,setForm]=useState(initial); useEffect(()=>setForm(initial),[initial]);
 const set=(k,v)=>setForm(p=>({...p,[k]:v}));
 return <form onSubmit={e=>{e.preventDefault();onSubmit({...form,age:Number(form.age)})}}>
  <div className="form-grid">
   <label>Donor ID<input value={form.donorId} onChange={e=>set("donorId",e.target.value)} placeholder="DONOR-0001" disabled={editing} required/><small>{editing?"Partition key cannot be changed.":"Enter the DynamoDB partition key manually."}</small></label>
   <label>Full name<input value={form.name} onChange={e=>set("name",e.target.value)} placeholder="Ritu Bhandari" required/></label>
   <label>Blood group<select value={form.bloodGroup} onChange={e=>set("bloodGroup",e.target.value)} required><option value="">Select blood group</option>{bloodGroups.map(x=><option key={x}>{x}</option>)}</select></label>
   <label>Age<input type="number" min="18" max="65" value={form.age} onChange={e=>set("age",e.target.value)} placeholder="30" required/></label>
   <label>Gender<select value={form.gender} onChange={e=>set("gender",e.target.value)} required><option value="">Select gender</option><option>Male</option><option>Female</option><option>Other</option></select></label>
   <label>Phone<input value={form.phone} onChange={e=>set("phone",e.target.value)} placeholder="9801000010" required/></label>
   <label>Email<input type="email" value={form.email} onChange={e=>set("email",e.target.value)} placeholder="donor@example.com"/></label>
   <label>City<input value={form.city} onChange={e=>set("city",e.target.value)} placeholder="Kathmandu"/></label>
   <label className="full">Address<input value={form.address} onChange={e=>set("address",e.target.value)} placeholder="Street / area"/></label>
   <label>Last donation date<input type="date" value={form.lastDonationDate} onChange={e=>set("lastDonationDate",e.target.value)}/></label>
  </div>
  <div className="modal-actions"><button type="button" className="button secondary" onClick={onCancel}>Cancel</button><button className="button primary" disabled={saving}>{saving?<><Loader2 className="spin" size={17}/> Saving...</>:editing?"Save changes":"Add donor"}</button></div>
 </form>
}
function Details({donor,onClose}){
 return <Modal title="Donor details" onClose={onClose}><div className="details-top"><div className="avatar">{donor.name?.[0]?.toUpperCase()||"D"}</div><div><h3>{donor.name}</h3><span className="id-badge">{donor.donorId}</span></div><span className="blood-badge">{donor.bloodGroup}</span></div><div className="details-grid">{[["Age",donor.age],["Gender",donor.gender],["Phone",donor.phone],["Email",donor.email||"—"],["City",donor.city||"—"],["Address",donor.address||"—"],["Last donation",donor.lastDonationDate||"—"]].map(([k,v])=><div className="detail-item" key={k}><span>{k}</span><strong>{v}</strong></div>)}</div></Modal>
}

export default function App(){
 const [donors,setDonors]=useState([]),[loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false),[error,setError]=useState(""),[search,setSearch]=useState(""),[blood,setBlood]=useState(""),[city,setCity]=useState(""),[modal,setModal]=useState(null),[saving,setSaving]=useState(false),[notice,setNotice]=useState("");
 const load=async(silent=false)=>{try{silent?setRefreshing(true):setLoading(true);setError("");const d=await api();setDonors(d.donors||d.items||[])}catch(e){setError(e.message)}finally{setLoading(false);setRefreshing(false)}};
 useEffect(()=>{load()},[]);
 const cities=[...new Set(donors.map(d=>d.city).filter(Boolean))].sort();
 const filtered=useMemo(()=>{const q=search.toLowerCase().trim();return donors.filter(d=>(!q||[d.donorId,d.name,d.phone,d.email,d.city,d.address,d.bloodGroup].some(v=>String(v??"").toLowerCase().includes(q)))&&(!blood||d.bloodGroup===blood)&&(!city||d.city===city))},[donors,search,blood,city]);
 const save=async form=>{try{setSaving(true);setError("");if(modal.type==="create"){await api("",{method:"POST",body:JSON.stringify(form)});setNotice(`Donor ${form.donorId} created successfully.`)}else{const {donorId,...body}=form;await api(`/${encodeURIComponent(donorId)}`,{method:"PUT",body:JSON.stringify(body)});setNotice(`Donor ${donorId} updated successfully.`)}setModal(null);await load(true)}catch(e){setError(e.message)}finally{setSaving(false)}};
 const del=async d=>{if(!confirm(`Delete ${d.name} (${d.donorId})?`))return;try{setError("");await api(`/${encodeURIComponent(d.donorId)}`,{method:"DELETE"});setNotice(`Donor ${d.donorId} deleted.`);await load(true)}catch(e){setError(e.message)}};
 useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(""),3500);return()=>clearTimeout(t)},[notice]);
 return <div className="app-shell">
  <header className="topbar"><div className="brand"><div className="brand-mark"><Droplet size={23} fill="currentColor"/></div><div><strong>BloodCare</strong><span>Donor Management</span></div></div><div className="api-status"><span className="status-dot"/> REST API connected</div></header>
  <main className="container">
   <section className="hero"><div><div className="eyebrow"><Activity size={15}/> DONOR RECORDS</div><h1>Blood donor management</h1><p>Manage donor profiles, contact information and donation history.</p></div><button className="button primary" onClick={()=>setModal({type:"create"})}><Plus size={18}/> Add donor</button></section>
   {notice&&<div className="toast success">✓ {notice}</div>}{error&&<div className="toast error"><AlertCircle size={17}/>{error}<button onClick={()=>setError("")}><X size={15}/></button></div>}
   <section className="stats"><div className="stat-card"><div className="stat-icon"><UserRound size={20}/></div><div><b>{donors.length}</b><span>Total donors</span></div></div><div className="stat-card"><div className="stat-icon"><Droplet size={20}/></div><div><b>{new Set(donors.map(d=>d.bloodGroup).filter(Boolean)).size}</b><span>Blood groups</span></div></div><div className="stat-card"><div className="stat-icon"><MapPin size={20}/></div><div><b>{new Set(donors.map(d=>d.city).filter(Boolean)).size}</b><span>Cities</span></div></div><div className="stat-card"><div className="stat-icon"><CalendarDays size={20}/></div><div><b>{filtered.length}</b><span>Showing</span></div></div></section>
   <section className="panel"><div className="toolbar"><div className="search-wrap"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name, ID, phone, city..."/></div><select value={blood} onChange={e=>setBlood(e.target.value)}><option value="">All blood groups</option>{bloodGroups.map(x=><option key={x}>{x}</option>)}</select><select value={city} onChange={e=>setCity(e.target.value)}><option value="">All cities</option>{cities.map(x=><option key={x}>{x}</option>)}</select><button className="icon-button bordered" onClick={()=>load(true)}><RefreshCw size={18} className={refreshing?"spin":""}/></button></div>
   {loading?<div className="state"><Loader2 size={30} className="spin"/><p>Loading donor records...</p></div>:filtered.length===0?<div className="state"><UserRound size={38}/><h3>No donors found</h3><p>Try changing your filters or add a donor.</p></div>:<div className="table-wrap"><table><thead><tr><th>Donor</th><th>Blood</th><th>Age / Gender</th><th>Contact</th><th>City</th><th>Last donation</th><th/></tr></thead><tbody>{filtered.map(d=><tr key={d.donorId}><td><div className="donor-cell"><div className="mini-avatar">{d.name?.[0]?.toUpperCase()||"D"}</div><div><strong>{d.name}</strong><span>{d.donorId}</span></div></div></td><td><span className="blood-badge">{d.bloodGroup}</span></td><td>{d.age} <span className="muted">/ {d.gender}</span></td><td><div className="contact-cell"><span><Phone size={13}/> {d.phone}</span><span>{d.email||"—"}</span></div></td><td>{d.city||"—"}</td><td>{d.lastDonationDate||"—"}</td><td><div className="row-actions"><button className="icon-button" onClick={()=>setModal({type:"view",donor:d})}><Eye size={17}/></button><button className="icon-button" onClick={()=>setModal({type:"edit",donor:d})}><Edit3 size={17}/></button><button className="icon-button danger" onClick={()=>del(d)}><Trash2 size={17}/></button></div></td></tr>)}</tbody></table></div>}</section>
  </main>
  <footer>BloodCare Donor Management · React + API Gateway + Lambda + DynamoDB</footer>
  {modal?.type==="create"&&<Modal title="Add new donor" onClose={()=>setModal(null)}><DonorForm initial={emptyForm} editing={false} saving={saving} onCancel={()=>setModal(null)} onSubmit={save}/></Modal>}
  {modal?.type==="edit"&&<Modal title="Edit donor" onClose={()=>setModal(null)}><DonorForm initial={modal.donor} editing saving={saving} onCancel={()=>setModal(null)} onSubmit={save}/></Modal>}
  {modal?.type==="view"&&<Details donor={modal.donor} onClose={()=>setModal(null)}/>}
 </div>
}