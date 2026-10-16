using System.Net;
using Deepfield.Api;
using Deepfield.Engine;
using Microsoft.AspNetCore.Http;

public static class LocalTurnChecks
{
    public static async Task Run()
    {
        var count=0;
        void Check(bool ok,string message){if(!ok)throw new Exception(message);count++;}
        Check(LocalTurns.Enabled(true,true,false),"Isolated development preview enables Run turn");
        Check(LocalTurns.Enabled(true,false,true),"Existing explicit local test mode remains supported");
        Check(!LocalTurns.Enabled(true,false,false),"Normal development campaign cannot accelerate");
        Check(!LocalTurns.Enabled(false,true,true),"Production cannot accelerate even with both flags");
        var context=new DefaultHttpContext();context.Connection.RemoteIpAddress=IPAddress.Loopback;context.Request.Host=new("127.0.0.1:5098");
        Check(LocalTurns.Allowed(true,context),"Direct loopback preview allowed");
        Check(!LocalTurns.Allowed(false,context),"Disabled capability denied");
        foreach(var header in new[]{"Forwarded","X-Forwarded-For","CF-Connecting-IP"}){
            context.Request.Headers[header]="127.0.0.1";
            Check(!LocalTurns.Allowed(true,context),"Forwarding header denied: "+header);
            context.Request.Headers.Remove(header);
        }
        context.Request.Host=new("starzdeepfield.com");Check(!LocalTurns.Allowed(true,context),"Public host denied");
        context.Request.Host=new("localhost");context.Connection.RemoteIpAddress=IPAddress.Parse("192.0.2.1");Check(!LocalTurns.Allowed(true,context),"Remote address denied");
        var now=DateTimeOffset.Parse("2026-10-16T00:00:00Z");
        var path=Path.Combine(Path.GetTempPath(),"deepfield-turn-check-"+Guid.NewGuid().ToString("N"),"campaign.json");
        var store=new FileGameStore(path,()=>Rules.Create(42,now,false));
        // Scheduler-first and button-first interleavings both use the same atomic store.
        await store.Execute(g=>{g.Deadline=now;return true;});
        await store.Execute(g=>Rules.Resolve(g,now));
        Check(!(await store.Execute(g=>LocalTurns.Resolve(g,1,now))).Advanced,"Scheduler winning race makes old button request a no-op");
        var results=await Task.WhenAll(Enumerable.Range(0,8).Select(_=>store.Execute(g=>LocalTurns.Resolve(g,2,now))));
        Check(results.Count(r=>r.Advanced)==1,"Concurrent button retries advance exactly once");
        Check(!await store.Execute(g=>Rules.Resolve(g,now)),"Scheduler after button cannot advance again");
        var reopened=new FileGameStore(path,()=>throw new Exception("Must reopen persisted campaign"));
        Check(!(await reopened.Execute(g=>LocalTurns.Resolve(g,2,now))).Advanced,"Repeated request after reopening cannot advance");
        Check(await reopened.Execute(g=>g.Turn==3&&g.Deadline==now.AddDays(1),false),"Next deadline and turn persist");
        await reopened.Execute(g=>{g.Winner=0;return true;});
        Check(!await reopened.Execute(g=>LocalTurns.Resolve(g,3,now).Advanced),"Completed campaign cannot advance");
        Console.WriteLine($"{count} local turn capability and persistence checks passed.");
    }
}
