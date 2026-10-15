using Deepfield.Engine;
using System.Text.Json;
using System.Text.Json.Nodes;

public static class EconomyChecks
{
    public static void Run()
    {
        var now=DateTimeOffset.Parse("2026-10-15T12:00:00Z");var count=0;
        void Check(bool ok,string label){if(!ok)throw new Exception(label);count++;Console.WriteLine("PASS "+label);}
        Game New(int version=1)=>Rules.Create(42,now,false,version);
        var legacy=New(0);legacy.Stars[0].Collectors=100;Rules.Resolve(legacy,legacy.Deadline);
        Check(legacy.Clans[0].Credits==75,"Legacy collector income remains unchanged");
        var g=New();Check(Rules.Observe(g,0).NextIncome==18,"Economy preview projects base income plus first collector");
        Check(Enumerable.Range(0,5).Select(Economy.CollectorIncome).SequenceEqual(new[]{0,3,5,6,6}),"Collector income has explicit diminishing returns and cap");
        g.Stars[0].Collectors=100;Rules.Resolve(g,g.Deadline);
        Check(g.Clans[0].Credits==81,"Even 100 collectors cannot exceed 21 income per colony");
        var rejected=false;try{Rules.Validate(Rules.Observe(New(0),0),[new("defense",0)]);}catch(RuleException){rejected=true;}
        Check(rejected,"Legacy campaigns cannot accidentally purchase new defenses");
        g=New();Rules.Submit(g,0,new(1,0,"build-defense",[new("defense",0),new("defense",0),new("defense",0)]),now);Rules.Resolve(g,g.Deadline);
        Check(g.Stars[0].Defense==6&&g.Clans[0].Credits==54,"Three fixed emplacements cost 24 and create capped strength 6");
        rejected=false;try{Rules.Validate(Rules.Observe(g,0),[new("defense",0)]);}catch(RuleException){rejected=true;}
        Check(rejected,"Cannot exceed defense cap across existing and queued construction");
        g=New();rejected=false;try{Rules.Validate(Rules.Observe(g,0),Enumerable.Repeat(new Order("defense",0),4).ToList());}catch(RuleException){rejected=true;}
        Check(rejected,"Cannot bypass defense cap with multiple orders");
        g=New();g.Stars[0].Ships=[0,8];g.Stars[0].Defense=6;g.Stars[0].Scouts[0]=2;Rules.Resolve(g,g.Deadline);
        Check(g.Stars[0].Owner==1&&g.Stars[0].Defense==0&&g.Stars[0].Collectors==0&&g.Stars[0].Scouts[0]==0,"Maximum ungarrisoned defense is conquerable by eight ships");
        g=New();g.Stars[0].Ships=[0,2];g.Stars[0].Defense=6;Rules.Resolve(g,g.Deadline);
        Check(g.Stars[0].Owner==0&&g.Stars[0].Defense==4&&g.Stars[0].Ships[1]==0,"Attacks permanently attrit fixed defenses; no automatic repair");
        var symmetric=true;
        for(var a=0;a<15;a++)for(var b=0;b<15;b++)for(var defense=0;defense<=6;defense++)
        {
            var x=New();var y=New();x.Stars[1].Owner=0;y.Stars[1].Owner=1;x.Stars[1].Ships=[a,b];y.Stars[1].Ships=[b,a];x.Stars[1].Defense=y.Stars[1].Defense=defense;
            Rules.Resolve(x,x.Deadline);Rules.Resolve(y,y.Deadline);
            symmetric &= x.Stars[1].Ships[0]==y.Stars[1].Ships[1]&&x.Stars[1].Ships[1]==y.Stars[1].Ships[0]&&x.Stars[1].Defense==y.Stars[1].Defense&&(x.Stars[1].Owner is int owner?1-owner:(int?)null)==y.Stars[1].Owner;
        }
        Check(symmetric,"1575 mirrored fleet/defense cases preserve team symmetry");
        var visible=New();var hidden=New();hidden.Stars[11].Defense=6;
        Check(JsonSerializer.Serialize(Rules.Observe(visible,0))==JsonSerializer.Serialize(Rules.Observe(hidden,0)),"Hidden defense strength never changes pre-contact view or estimates");
        Check(JsonSerializer.Serialize(Rules.PlanAi(Rules.Observe(visible,0)))==JsonSerializer.Serialize(Rules.PlanAi(Rules.Observe(hidden,0))),"AI defense decisions use filtered intelligence only");
        var old=JsonNode.Parse(JsonSerializer.Serialize(New(0)))!;old["Schema"]=2;old.AsObject().Remove("EconomyVersion");foreach(var star in old["Stars"]!.AsArray())star!.AsObject().Remove("Defense");
        var upgraded=GameCodec.Read(old.ToJsonString());
        Check(upgraded.Schema==4&&upgraded.EconomyVersion==0&&upgraded.Stars.All(s=>s.Defense==0)&&upgraded.Deadline==New(0).Deadline,"Schema 2 migration keeps legacy rules and initializes zero defenses");
        Console.WriteLine($"{count} economy/defense checks passed.");
    }
}
