import React from "react";

type State={hasError:boolean; error?:any; key:number};

export default class RouteErrorBoundary extends React.Component<React.PropsWithChildren,State>{
  state:State={hasError:false,error:undefined,key:0};

  static getDerivedStateFromError(error:any){ return {hasError:true,error}; }

  componentDidCatch(error:any,info:any){
    // You can forward to your logger here if desired
    // console.error("[RouteErrorBoundary]",error,info);
  }

  private retry=()=>{
    // Soft remount children
    this.setState({hasError:false,error:undefined,key:this.state.key+1});
  };

  render(){
    if(this.state.hasError){
      return (
        <div className="p-6">
          <div className="rounded-2xl border border-white/20 bg-white/5 p-6">
            <div className="text-xl font-semibold text-white mb-1">We couldn’t open this page.</div>
            <div className="text-white/70 text-sm mb-4">
              Something went wrong while loading this screen. Try again, or come back in a moment.
            </div>
            <div className="flex gap-2">
              <button onClick={this.retry} className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20">
                Try again
              </button>
              <button onClick={()=>window.location.reload()} className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20">
                Reload app
              </button>
            </div>

            {/* Optional details toggle for devs */}
            <details className="mt-4 text-xs text-white/60">
              <summary>Error details</summary>
              <pre className="mt-2 whitespace-pre-wrap break-words">{String(this.state.error?.message||this.state.error||"Unknown error")}</pre>
            </details>
          </div>
        </div>
      );
    }
    return <React.Fragment key={this.state.key}>{this.props.children}</React.Fragment>;
  }
}
