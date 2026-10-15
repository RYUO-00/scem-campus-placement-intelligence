export function Loading({label='Loading records…'}){return <div className="inline-loading"><span className="spinner"/>{label}</div>;}
export function ErrorBanner({children}){return children?<div className="banner banner-error" role="alert">{children}</div>:null;}
export function SuccessBanner({children}){return children?<div className="banner banner-success" role="status">{children}</div>:null;}
export function EmptyState({title,body,action}){return <div className="empty-state"><div className="empty-mark">↗</div><h3>{title}</h3><p>{body}</p>{action}</div>;}
export function PageHeading({eyebrow,title,description,action}){return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{description&&<p>{description}</p>}</div>{action&&<div className="heading-action">{action}</div>}</div>;}
