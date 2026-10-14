using System.Text.Json;
using Deepfield.Api;
using Deepfield.Engine;

public static class Checks
{
    static readonly DateTimeOffset Now=DateTimeOffset.Parse("2026-10-14T12:00:00Z");
    static int count;
    static void Assert(bool ok,string message) { if(!ok) throw new Exception(message); count++; Console.WriteLine("PASS "+message); }
    static void Reject(Action action,string message) { try{action();}catch(RuleException){Assert(true,message);return;}throw new Exception("Expected rejection: "+message); }
    static Game New()=>Rules.Create(42,Now,false);
    static Submission Request(Game g,int team,List<Order> orders,string? id=null)=>new(g.Turn,g.Clans[team].Revision,id??Guid.NewGuid().ToString(),orders);
    public static async Task Run()
    {
        var g=New();
        Assert(JsonSerializer.Serialize(g)==JsonSerializer.Serialize(New()),"Seed and time reproduce initial state");
        Assert(JsonSerializer.Serialize(g)!=JsonSerializer.Serialize(Rules.Create(43,Now,false)),"Different seeds change layout");
        var view=Rules.Observe(g,0);
        Assert(view.Stars[11].Owner==null&&view.Stars[11].Ships==null&&!view.Stars[11].Known,"Enemy homeworld secrets withheld");
        Assert(view.Stars[1].Known&&!view.Stars[1].Visible&&view.Stars[1].Collectors==null,"Charted frontier has no current intelligence");
        Reject(()=>Rules.Submit(g,0,Request(g,0,[new("move",11,10,1)]),Now),"Cannot command hidden enemy source");
        Reject(()=>Rules.Submit(g,0,Request(g,0,[new("move",0,11,1)]),Now),"Cannot move to hidden/nonadjacent star");
        Reject(()=>Rules.Submit(g,0,Request(g,0,[new("build",0,Ships:13)]),Now),"Aggregate treasury enforced");
        Reject(()=>Rules.Submit(g,0,Request(g,0,[new("move",0,1,5),new("move",0,6,5)]),Now),"Cannot overspend fleet across split moves");
        Reject(()=>Rules.Submit(g,0,Request(g,0,[new("build",0,Ships:2),new("move",0,1,9)]),Now),"Newly built ships cannot move immediately");
        Reject(()=>Rules.Submit(g,0,Request(g,0,[null!]),Now),"Null order rejected cleanly");
        var request=Request(g,0,[new("move",0,1,4)],"retry-test");
        var revision=Rules.Submit(g,0,request,Now);
        Assert(Rules.Submit(g,0,request,Now)==revision&&g.Clans[0].Orders.Count==1,"Identical retry does not duplicate orders");
        Reject(()=>Rules.Submit(g,0,request with {Orders=[]},Now),"Request ID content cannot change");
        Reject(()=>Rules.Submit(g,0,request with {RequestId="stale"},Now),"Stale clan revision rejected");
        Reject(()=>Rules.Submit(g,0,Request(g,0,[]),g.Deadline),"Exact deadline rejects new orders");
        Assert(!Rules.Resolve(g,g.Deadline.AddTicks(-1)),"Cannot resolve before deadline");
        var copy=JsonSerializer.Deserialize<Game>(JsonSerializer.Serialize(g))!;
        var deadline=g.Deadline;
        Assert(Rules.Resolve(g,deadline),"Resolution at deadline succeeds"); Rules.Resolve(copy,deadline);
        Assert(JsonSerializer.Serialize(g)==JsonSerializer.Serialize(copy),"Full resolution deterministically replays");
        Assert(g.Stars[1].Owner==0&&g.Stars[1].Ships[0]==2&&g.Clans[0].Credits==90,"Expedition establishes colony, converts ships and earns income");
        Assert(!Rules.Resolve(g,deadline)&&g.Turn==2,"Duplicate resolver does not advance");
        Assert(Rules.Submit(g,0,request,deadline)==revision,"Committed request retry survives turn boundary");
        var late=g.Deadline.AddDays(20); Rules.Resolve(g,late);
        Assert(g.Turn==3&&g.Deadline==late.AddDays(1)&&!Rules.Resolve(g,late),"Outage advances only once and sets future deadline");
        g=New(); g.Stars[1].Ships=[5,3]; g.Clans[1].Known.Add(1); Rules.Resolve(g,g.Deadline);
        Assert(g.Stars[1].Owner==0&&g.Stars[1].Ships.Sum()==0,"Combat attrition precedes colony founding");
        g=New(); g.Stars[1].Ships=[3,3]; Rules.Resolve(g,g.Deadline);
        Assert(g.Stars[1].Owner==null&&g.Stars[1].Ships.Sum()==0,"Equal fleets mutually destroy");
        g=New(); g.Stars[0].Ships=[0,3]; Rules.Resolve(g,g.Deadline);
        Assert(g.Stars[0].Owner==1&&g.Stars[0].Collectors==0&&g.Clans[0].Reports.Any(r=>r.Contains("was lost")),"Captured colony destroys collectors and informs defender");
        g=New(); for(var i=0;i<4;i++){g.Stars[i].Owner=0;g.Stars[i].Collectors=2;} Rules.Resolve(g,g.Deadline);
        Assert(g.Winner==0&&!Rules.Resolve(g,g.Deadline),"Reachable Type III victory freezes turn advancement");
        g=New(); for(var i=0;i<8;i++){g.Stars[i].Owner=i/4;g.Stars[i].Collectors=2;} Rules.Resolve(g,g.Deadline);
        Assert(g.Winner==2,"Simultaneous Type III victory is shared");
        g=Rules.Create(99,Now,true);
        for(var turn=0;turn<60&&g.Winner==null;turn++){Rules.Validate(Rules.Observe(g,1),Rules.PlanAi(Rules.Observe(g,1)));Rules.Resolve(g,g.Deadline);}
        Assert(g.Winner==1,"AI can reach victory using legal visible orders");
        var before=Rules.PlanAi(Rules.Observe(New(),1)); var secret=New();secret.Clans[0].Credits=999;secret.Stars[0].Ships[0]=99;
        Assert(JsonSerializer.Serialize(before)==JsonSerializer.Serialize(Rules.PlanAi(Rules.Observe(secret,1))),"Hidden enemy changes do not influence AI");
        var directory=Path.Combine(Path.GetTempPath(),"deepfield-checks-"+Guid.NewGuid());Directory.CreateDirectory(directory);
        var path=Path.Combine(directory,"campaign.json"); IGameStore store=new FileGameStore(path,New);
        await StoreChecks(store,()=>new FileGameStore(path,()=>throw new Exception("Should load existing save")));
        var connection=Environment.GetEnvironmentVariable("DEEPFIELD_TEST_POSTGRES");
        if(connection is not null)
        {
            var pg=new PostgresGameStore(connection,New);await pg.Initialize();
            Console.WriteLine("PostgreSQL test requires a disposable database with no existing campaign.");
            await StoreChecks(pg,()=>new PostgresGameStore(connection,New));
        }
        else Console.WriteLine("SKIP PostgreSQL integration: DEEPFIELD_TEST_POSTGRES not configured.");
        Console.WriteLine($"{count} checks passed. Test save: {path}");
    }
    static async Task StoreChecks(IGameStore store,Func<IGameStore> restart)
    {
        var request=Request(New(),0,[new("build",0,Ships:2)],"persisted-retry");
        await store.Execute(g=>Rules.Submit(g,0,request,Now));
        var reboot=restart();
        Assert(await reboot.Execute(g=>Rules.Submit(g,0,request,Now))==1,"Persisted receipt survives reopening store");
        var resolutions=await Task.WhenAll(Enumerable.Range(0,12).Select(_=>restart().Execute(g=>Rules.Resolve(g,Now.AddDays(1)))));
        Assert(resolutions.Count(x=>x)==1,"Twelve concurrent resolvers commit one turn");
        Assert(await reboot.Execute(g=>g.Turn,false)==2,"Persisted turn remains advanced exactly once");
        var credits=await reboot.Execute(g=>g.Clans[0].Credits,false);
        try{await reboot.Execute<bool>(g=>{g.Clans[0].Credits=999;throw new RuleException("rollback");});}catch(RuleException){}
        Assert(await restart().Execute(g=>g.Clans[0].Credits,false)==credits,"Failed mutation rolls back without partial state");
        Assert(!await restart().Execute(g=>Rules.Resolve(g,Now.AddDays(1))),"Restart does not repeat committed resolution");
    }
}
