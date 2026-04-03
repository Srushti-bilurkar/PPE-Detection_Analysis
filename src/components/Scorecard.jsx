export default function Scorecard() {
  const contractors = [
    { name:'Apex Concrete', trade:'concrete', score:91, grade:'A' },
    { name:'BoldSteel',     trade:'steel',    score:67, grade:'C' },
    { name:'TechMEP',       trade:'mep',      score:79, grade:'B' },
  ]
  return (
    <div className="panel">
      <div className="panel-header"><div className="panel-title">🏆 Sub-Contractor Scorecard</div></div>
      <div className="panel-body">
        <table className="score-table">
          <thead>
            <tr><th>Contractor</th><th>Trade</th><th>Score</th><th>Grade</th></tr>
          </thead>
          <tbody>
            {contractors.map(c => (
              <tr key={c.name}>
                <td><strong>{c.name}</strong></td>
                <td><span className={`trade-tag ${c.trade}`}>{c.trade.toUpperCase()}</span></td>
                <td>
                  <div className="score-bar-wrap">
                    <div className="score-bar">
                      <div className="score-bar-fill" style={{width:`${c.score}%`,background:'var(--blue-vivid)'}}></div>
                    </div>
                    <span className="score-num">{c.score}</span>
                  </div>
                </td>
                <td><div className={`score-grade grade-${c.grade.toLowerCase()}`}>{c.grade}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}