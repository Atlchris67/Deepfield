using System.Text.Json;
using System.Text.Json.Nodes;
using Deepfield.Engine;
using Deepfield.Api;

public static class ReconChecks
{
    public static async Task Run()
    {
        var count=0; var now=DateTimeOffset.Parse("2026-10-15T12:00:00Z");
        void Check(bool ok,string label){if(!ok)throw new Exception(label);count++;Console.WriteLine("PASS "+label);}
        Game Fixture(){var g=Rules.Create(42,now,false, reconEntropy: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");g.Stars[0].Scouts[0]=4;g.Stars[1].Owner=1;g.Stars[1].Ships[1]=7;g.Stars[1].Scouts[1]=2;g.Stars[1].Collectors=3;return g;}
        Game Mission(string mission,bool returns){var g=Fixture();g.ReconRates=returns?new(100,100,100):new(0,0,0);Rules.Submit(g,0,new(1,0,"mission",[new("recon",0,1,1,mission)]),now);return g;}
        var g=Mission("deep",true); var copy=GameCodec.Read(JsonSerializer.Serialize(g));var due=g.Deadline;
        Rules.Resolve(g,due);Rules.Resolve(copy,due);
        Check(JsonSerializer.Serialize(g)==JsonSerializer.Serialize(copy),"Recon resolution and reports replay deterministically");
        var intel=g.Clans[0].Intelligence.Single();
        Check(intel.EnemyShips==7&&intel.EnemyScouts==2&&intel.Collectors==3&&intel.Owner==1&&intel.Returned,"Returning deep scout reports encountered exact composition");
        Check(g.Stars[0].Scouts[0]==4&&!Rules.Resolve(g,due)&&g.Clans[0].Intelligence.Count==1,"Scout return/repeated resolution preserves fleet and one report");
        Check(Rules.Observe(g,1).Intelligence!.Count==0&&Rules.Observe(g,0).Stars[1].Ships==null,"ISR is clan-private and does not grant live target vision");
        g.Stars[1].Ships[1]=99;Rules.Resolve(g,g.Deadline);
        Check(g.Clans[0].Intelligence.Single().EnemyShips==7&&g.Clans[0].Intelligence.Single().Turn==1,"Old intelligence retains timestamp and never silently updates");
        foreach(var mission in new[]{"distant","close","deep"})
        {
            g=Mission(mission,false);Rules.Resolve(g,g.Deadline);intel=g.Clans[0].Intelligence.Single();
            Check(g.Stars[0].Scouts[0]==3&&!intel.Returned&&intel.EnemyPresent==true&&intel.EnemyShips==null&&intel.EnemyScouts==null&&intel.Collectors==null&&!intel.OwnerObserved&&intel.FleetBand==null,"Destroyed "+mission+" scout sends only limited contact");
        }
        g=Mission("distant",false);g.Stars[1].Owner=null;g.Stars[1].Ships[1]=0;g.Stars[1].Scouts[1]=0;Rules.Resolve(g,g.Deadline);
        Check(g.Clans[0].Intelligence.Single().EnemyPresent==null,"Lost scout does not confirm a system is empty");
        g=Mission("distant",true);Rules.Resolve(g,g.Deadline);intel=g.Clans[0].Intelligence.Single();
        Check(intel.OwnerObserved&&intel.EnemyPresent==true&&intel.FleetBand==null&&intel.EnemyShips==null,"Distant return reports contact and ownership without fleet counts");
        g=Mission("close",true);Rules.Resolve(g,g.Deadline);intel=g.Clans[0].Intelligence.Single();
        Check(intel.FleetBand=="5–9"&&intel.EnemyShips==null&&intel.Collectors==null,"Close return reports fleet band rather than exact composition");
        var a=Fixture();var b=Fixture();b.Stars[1].Ships[1]=100;
        Check(JsonSerializer.Serialize(Rules.Observe(a,0))==JsonSerializer.Serialize(Rules.Observe(b,0)),"Risk estimates and visible state do not leak hidden fleet changes");
        var order=new Order("recon",0,1,1,"close");
        Check(Recon.Roll(a,0,order,0)==Recon.Roll(b,0,order,0),"Recon roll is independent of hidden enemy strength");
        Rules.Validate(Rules.Observe(a,0),[order]);Rules.Validate(Rules.Observe(b,0),[order]);
        Check(JsonSerializer.Serialize(Rules.PlanAi(Rules.Observe(a,0)))==JsonSerializer.Serialize(Rules.PlanAi(Rules.Observe(b,0))),"Paired hidden states permit identical missions and AI choices");
        var permutationA=Fixture();var permutationB=Fixture();
        List<Order> missions=[new("recon",0,1,1,"distant"),order,new("recon",0,1,1,"deep"),order];
        Rules.Submit(permutationA,0,new(1,0,"first-request",missions),now);
        Rules.Submit(permutationB,0,new(1,0,"different-request",[new("collector",0),..missions.AsEnumerable().Reverse()]),now);
        Rules.Resolve(permutationA,permutationA.Deadline);Rules.Resolve(permutationB,permutationB.Deadline.AddHours(2));
        string Outcomes(Game campaign)=>JsonSerializer.Serialize(campaign.Clans[0].Intelligence.OrderBy(i=>i.Id).Select(i=>new{i.Id,i.Returned}));
        Check(Outcomes(permutationA)==Outcomes(permutationB),"Request IDs, permutations, unrelated orders and resolution wall clock cannot reroll missions");
        var noCombatShips=Fixture();noCombatShips.Stars[0].Ships[0]=0;var moveRejected=false;
        try{Rules.Validate(Rules.Observe(noCombatShips,0),[new("move",0,1,1)]);}catch(RuleException){moveRejected=true;}
        Check(moveRejected,"Scout inventory cannot be spent as ordinary moving/combat ships");
        Check(new ReconRates()==new ReconRates(90,65,35),"Initial distant/close/deep return targets are 90/65/35");
        var unpredictableA=Rules.Create(42017,now,false);var unpredictableB=Rules.Create(42017,now,false);
        Check(unpredictableA.ReconEntropy!=unpredictableB.ReconEntropy,"Identical public map seeds receive independent private game entropy");
        Check(JsonSerializer.Serialize(Rules.Observe(unpredictableA,0))==JsonSerializer.Serialize(Rules.Observe(unpredictableB,0))&&!JsonSerializer.Serialize(Rules.Observe(unpredictableA,0)).Contains(unpredictableA.ReconEntropy!),"Private entropy never enters clan views or reports");
        unpredictableA.Turn=2;unpredictableB.Turn=2;var oldPredictions=new List<int>();var privateOutcomes=new List<int>();var secondOutcomes=new List<int>();
        foreach(var target in new[]{1,6})foreach(var tier in new[]{"distant","close","deep"})
        {
            var publicKey=$"recon-v1|42017|2|0|0|{target}|{tier}|0";
            oldPredictions.Add((int)(System.Buffers.Binary.BinaryPrimitives.ReadUInt32LittleEndian(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(publicKey)))%100));
            var mission=new Order("recon",0,target,1,tier);privateOutcomes.Add(Recon.Roll(unpredictableA,0,mission,0));secondOutcomes.Add(Recon.Roll(unpredictableB,0,mission,0));
        }
        Check(!oldPredictions.SequenceEqual(privateOutcomes)&&!privateOutcomes.SequenceEqual(secondOutcomes),"Documented seed and all six public route/tier inputs cannot reproduce private rolls");
        foreach(var invalid in new List<Order>[] { [new("recon",0,11,1,"deep")], [new("recon",0,1,2,"deep")], [new("recon",0,1,1,"bogus")], Enumerable.Repeat(order,5).ToList() })
        {var rejected=false;try{Rules.Validate(Rules.Observe(a,0),invalid);}catch(RuleException){rejected=true;}Check(rejected,"Reject illegal scout mission or aggregate oversubscription");}
        g=Rules.Create(42,now,false, reconEntropy: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");var failed=false;try{Rules.Validate(Rules.Observe(g,0),[new("scoutbuild",0,Ships:1),order]);}catch(RuleException){failed=true;}
        Check(failed,"Newly built scouts cannot fly on their construction turn");
        Rules.Submit(g,0,new(1,0,"scoutbuild",[new("scoutbuild",0,Ships:2)]),now);Rules.Resolve(g,g.Deadline);
        Check(g.Stars[0].Scouts[0]==2&&g.Clans[0].Credits==69,"Scouts cost 3 credits each and preserve ordinary income");
        g=Rules.Create(42,now,false, reconEntropy: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");var request=new Submission(1,0,"legacy-retry",[new("build",0,Ships:2)]);Rules.Submit(g,0,request,now);
        var legacy=JsonNode.Parse(JsonSerializer.Serialize(g))!;legacy["Schema"]=1;legacy.AsObject().Remove("ReconRates");legacy.AsObject().Remove("ReconEntropy");
        foreach(var star in legacy["Stars"]!.AsArray())star!.AsObject().Remove("Scouts");
        foreach(var clan in legacy["Clans"]!.AsArray())clan!.AsObject().Remove("Intelligence");
        var migrated=GameCodec.Read(legacy.ToJsonString());
        Check(migrated.Schema==4&&migrated.Stars[0].Ships[0]==8&&migrated.Deadline==g.Deadline&&migrated.Clans[0].Intelligence.Count==0,"Schema 1 migration preserves campaign without fabricating intelligence");
        Check(Rules.Submit(migrated,0,request,now)==1&&migrated.Clans[0].Orders.Count==1,"Legacy receipt bytes still match retried old orders");
        var directory=Path.Combine(Path.GetTempPath(),"deepfield-recon-"+Guid.NewGuid());Directory.CreateDirectory(directory);var path=Path.Combine(directory,"legacy.json");await File.WriteAllTextAsync(path,legacy.ToJsonString());
        var store=new FileGameStore(path,()=>throw new Exception("Expected existing save"));await store.Execute(x=>Rules.Submit(x,0,request,now));
        Check(GameCodec.Read(await File.ReadAllTextAsync(path)).Schema==4,"File store atomically persists compatible upgraded save");
        var entropy=await store.Execute(x=>x.ReconEntropy,false);var reopenedMigration=new FileGameStore(path,()=>throw new Exception("Expected migrated save"));
        Check(await reopenedMigration.Execute(x=>x.ReconEntropy,false)==entropy,"Legacy migration persists private entropy across read-only reopening");
        var failedPath=Path.Combine(directory,"failed-operation.json");await File.WriteAllTextAsync(failedPath,legacy.ToJsonString());var failedStore=new FileGameStore(failedPath,()=>throw new Exception("Expected fixture"));var beforeFailure=-1;
        try{await failedStore.Execute<bool>(x=>{beforeFailure=Recon.Roll(x,0,order,0);throw new RuleException("simulated interrupted operation");});}catch(RuleException){}
        Check(await new FileGameStore(failedPath,()=>throw new Exception("Expected fixture")).Execute(x=>Recon.Roll(x,0,order,0),false)==beforeFailure,"Migration entropy is committed before failed operation, preventing retry rerolls");
        var reconPath=Path.Combine(directory,"recon.json");var reconStore=new FileGameStore(reconPath,()=>Mission("deep",false));
        await reconStore.Execute(x=>Rules.Resolve(x,due));var reopened=new FileGameStore(reconPath,()=>throw new Exception("Expected save"));
        Check(!await reopened.Execute(x=>Rules.Resolve(x,due))&&await reopened.Execute(x=>x.Clans[0].Intelligence.Count,false)==1&&await reopened.Execute(x=>x.Stars[0].Scouts[0],false)==3,"Recon losses and reports persist once across restart/retry");
        Console.WriteLine($"{count} reconnaissance/migration checks passed.");
    }
}
