using Deepfield.Engine;
using Deepfield.Engine.Combat;
using Deepfield.Api;
using System.Text.Json;
using System.Text.Json.Nodes;

public static class TypedFleetChecks
{
    public static async Task Run()
    {
        var now=DateTimeOffset.Parse("2026-10-15T12:00:00Z");var checks=0;
        void Check(bool value,string label){if(!value)throw new Exception(label);checks++;Console.WriteLine("PASS "+label);}
        void Reject(Action act,string label){try{act();}catch(RuleException){Check(true,label);return;}throw new Exception("Expected rejection: "+label);}
        Game New()=>Rules.Create(42,now,false,1,1);
        var g=New();Check(g.CombatVersion==1&&g.Stars[0].Fleets![0].SequenceEqual(new[]{8,0,0,0,0}),"Typed preview initializes legacy starting fleet as interceptors");
        Reject(()=>Rules.Validate(Rules.Observe(g,0),[new("build",0,Ships:5,Hull:"cruiser")]),"Typed build costs cannot exceed treasury");
        Reject(()=>Rules.Validate(Rules.Observe(g,0),[new("move",0,1,1,Hull:"cruiser")]),"Aggregate fleet cannot substitute for missing selected hull");
        Reject(()=>Rules.Validate(Rules.Observe(g,0),[new("move",0,1,5,Hull:"interceptor"),new("move",0,6,4)]),"Named/default interceptor orders share one inventory");
        Reject(()=>Rules.Validate(Rules.Observe(g,0),[new("build",0,Ships:1,Hull:"cruiser"),new("move",0,1,1,Hull:"cruiser")]),"New typed ships cannot move in their construction turn");
        Reject(()=>Rules.Validate(Rules.Observe(g,0),[new("build",0,Ships:1,Hull:"unknown")]),"Unknown hull is rejected");
        Reject(()=>Rules.Validate(Rules.Observe(Rules.Create(42,now,false),0),[new("build",0,Ships:1,Hull:"cruiser")]),"Legacy campaign cannot silently activate typed ship orders");
        g.Stars[0].Fleets![0][2]=10000;TypedCombat.Sync(g.Stars[0]);g.Clans[0].Credits=100;
        Reject(()=>Rules.Validate(Rules.Observe(g,0),[new("build",0,Ships:1,Hull:"cruiser")]),"Global per-class cap prevents unresolvable oversized stacks");
        g=New();Rules.Submit(g,0,new(1,0,"typed-build",[new("build",0,Ships:2,Hull:"cruiser"),new("build",0,Ships:1,Hull:"disruptor")]),now);Rules.Resolve(g,g.Deadline);
        Check(g.Clans[0].Credits==40&&g.Stars[0].Fleets![0][2]==2&&g.Stars[0].Fleets![0][4]==1&&g.Stars[0].Ships[0]==11,"Typed construction charges exact class costs and synchronizes totals");
        var request=new Submission(g.Turn,0,"mixed-move",[new("move",0,1,2,Hull:"interceptor"),new("move",0,1,2,Hull:"cruiser"),new("move",0,1,1,Hull:"disruptor")]);
        Rules.Submit(g,0,request,now);var due=g.Deadline;var copy=GameCodec.Read(JsonSerializer.Serialize(g));Rules.Resolve(g,due);Rules.Resolve(copy,due);
        Check(JsonSerializer.Serialize(g)==JsonSerializer.Serialize(copy),"Mixed typed movements and resolution replay deterministically");
        Check(g.Stars[1].Owner==0&&g.Stars[1].Fleets![0].SequenceEqual(new[]{0,0,2,0,1}),"Mixed colony expedition consumes only two interceptors");
        Check(Rules.Submit(g,0,request,due)==1&&!Rules.Resolve(g,due),"Typed receipt retry cannot duplicate movement or advance again");
        g=New();g.Stars[1].Fleets![0][2]=2;TypedCombat.Sync(g.Stars[1]);Rules.Resolve(g,g.Deadline);
        Check(g.Stars[1].Owner==null&&g.Stars[1].Ships[0]==2,"Specialist-only fleet cannot become free habitats");
        var matchups=true;
        foreach(var left in Enum.GetValues<Hull>())foreach(var right in Enum.GetValues<Hull>().Where(h=>h!=left))
        {
            g=New();g.Stars[1].Fleets! [0][(int)left]=120/CounterBattle.Cost(left);g.Stars[1].Fleets![1][(int)right]=120/CounterBattle.Cost(right);TypedCombat.Sync(g.Stars[1]);Rules.Resolve(g,g.Deadline);
            var winner=CounterBattle.Counters(left,right)?0:1;
            matchups &= g.Stars[1].Ships[winner]>0&&g.Stars[1].Ships[1-winner]==0;
        }
        Check(matchups,"All 20 equal-cost counter matchups win inside campaign resolution");
        g=New();g.Stars[1].Fleets! [0]=[1,0,0,0,0];g.Stars[1].Fleets! [1]=[0,0,4,0,0];TypedCombat.Sync(g.Stars[1]);Rules.Resolve(g,g.Deadline);
        var lost=g.Clans[0].Intelligence.Single(i=>i.Mission=="battle");var survived=g.Clans[1].Intelligence.Single(i=>i.Mission=="battle");
        Check(!lost.Returned&&lost.EnemyComposition==null&&lost.EnemyShips==null&&survived.EnemyComposition![0]==1,"Destroyed fleet gets limited contact; surviving observer retains opening composition");
        Check(g.Clans[0].Reports.Any(r=>r.Contains("own hull losses [1 interceptor")&&r.Contains("0 cruiser")),"Battle reports distinguish actual own per-class losses");
        g=New();g.Stars[0].Fleets![0]=[0,0,0,0,0];g.Stars[0].Fleets![1]=[0,0,3,0,0];g.Stars[0].Defense=6;TypedCombat.Sync(g.Stars[0]);Rules.Resolve(g,g.Deadline);
        Check(g.Stars[0].Defense==0&&g.Stars[0].Fleets![0].All(n=>n==0)&&g.Stars[0].Fleets![1][2]>0,"Cruiser counter defeats fixed-defense interceptor profile without inventing ships");
        var a=New();var b=New();b.Stars[11].Fleets![1]=[0,10,8,7,6];TypedCombat.Sync(b.Stars[11]);
        Check(JsonSerializer.Serialize(Rules.Observe(a,0))==JsonSerializer.Serialize(Rules.Observe(b,0))&&JsonSerializer.Serialize(Rules.PlanAi(Rules.Observe(a,0)))==JsonSerializer.Serialize(Rules.PlanAi(Rules.Observe(b,0))),"Hidden composition cannot influence human views or AI plans");
        a.Clans[1].Intelligence.Add(new("observed",10,1,now,"before combat","deep",true,true,true,0,"5–9",8,0,1,0,[0,0,8,0,0]));
        Check(TypedCombat.ChooseHull(Rules.Observe(a,1),Rules.Observe(a,1).Stars[11])==4&&Rules.PlanAi(Rules.Observe(a,1)).Any(o=>o.Kind=="build"&&o.Hull=="disruptor"),"AI buys a counter using only its recent private composition report");
        a.Clans[1].Intelligence[0]=a.Clans[1].Intelligence[0] with {Turn=-10};
        Check(TypedCombat.ChooseHull(Rules.Observe(a,1),Rules.Observe(a,1).Stars[11])==0,"AI does not treat old composition as current intelligence");
        for(var schema=1;schema<=3;schema++)
        {
            var old=Rules.Create(42,now,false);var req=new Submission(1,0,"legacy",[new("build",0,Ships:2)]);Rules.Submit(old,0,req,now);
            var json=JsonNode.Parse(JsonSerializer.Serialize(old))!;json["Schema"]=schema;json.AsObject().Remove("CombatVersion");foreach(var star in json["Stars"]!.AsArray())star!.AsObject().Remove("Fleets");
            var migrated=GameCodec.Read(json.ToJsonString());
            Check(migrated.Schema==4&&migrated.CombatVersion==0&&migrated.Stars[0].Ships[0]==8&&migrated.Deadline==old.Deadline&&Rules.Submit(migrated,0,req,now)==1,"Schema "+schema+" migration preserves legacy fleet, rules, deadlines and receipt comparison");
        }
        var path=Path.Combine(Path.GetTempPath(),"deepfield-typed-"+Guid.NewGuid()+".json");
        var store=new FileGameStore(path,New);var typedRequest=new Submission(1,0,"persistent-typed",[new("build",0,Ships:2,Hull:"cruiser")]);
        await store.Execute(c=>Rules.Submit(c,0,typedRequest,now));var results=await Task.WhenAll(Enumerable.Range(0,12).Select(_=>new FileGameStore(path,New).Execute(c=>Rules.Resolve(c,now.AddDays(1)))));
        Check(results.Count(r=>r)==1&&await store.Execute(c=>c.Stars[0].Fleets![0][2],false)==2&&await store.Execute(c=>Rules.Submit(c,0,typedRequest,now.AddDays(1)))==1,"Concurrent typed resolution and reopening commit one fleet/order receipt");
        g=Rules.Create(71,now,true,1,1);for(var turn=0;turn<80&&g.Winner==null;turn++){Rules.Validate(Rules.Observe(g,1),Rules.PlanAi(Rules.Observe(g,1)));Rules.Resolve(g,g.Deadline);}
        Check(g.Winner==1,"Typed AI reaches victory with legal orders and colony escorts");
        Console.WriteLine($"{checks} typed-fleet integration checks passed.");
    }
}
