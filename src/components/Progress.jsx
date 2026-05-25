export default function Progress() {
  const items = [
    { name:'Steel A',    pct:88, status:'ahead',    color:'var(--green-safe)' },
    { name:'Steel B',    pct:64, status:'behind',   color:'var(--amber)' },
    { name:'Drywall L1', pct:8,  status:'critical', color:'var(--red-alert)' },
  ]
  return (
    <div className="panel">
      <div className="panel-header"><div className="panel-title">📈 Project Progress</div></div>
      <div className="panel-body">
        {items.map(item => (
          <div key={item.name} style={{marginBottom:'20px'}}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:'6px'}}>
              <span style={{fontWeight:600,fontSize:'13px'}}>{item.name}</span>
              <span style={{color:item.color,fontFamily:'var(--font-mono)',fontSize:'12px'}}>{item.pct}%</span>
            </div>
            <div style={{height:'10px',background:'var(--bg-elevated)',borderRadius:'5px',overflow:'hidden'}}>
              <div style={{height:'100%',width:`${item.pct}%`,background:item.color,borderRadius:'5px'}}></div>
            </div>
            <div style={{marginTop:'4px'}}><span className={`status-chip ${item.status}`}>{item.status.toUpperCase()}</span></div>
          </div>
        ))}
      </div>
    </div>
  )
}