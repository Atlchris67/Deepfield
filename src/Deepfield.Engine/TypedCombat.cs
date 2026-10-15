using Deepfield.Engine.Combat;

namespace Deepfield.Engine;

public static class TypedCombat
{
    static readonly string[] Names=["interceptor","torpedo","cruiser","bomber","disruptor"];
    public static string Name(int index)=>Names[index];
    public static int Index(string? name)
    {
        if(name is null)return 0;
        var index=Array.IndexOf(Names,name);
        return index>=0?index:throw new RuleException("Unknown hull class.");
    }
    public static int Cost(int index)=>CounterBattle.Cost((Hull)index);
    public static void Initialize(Game game)
    {
        if(game.CombatVersion!=0)throw new RuleException("Typed fleet initialization is one-time only.");
        if(Enumerable.Range(0,2).Any(team=>game.Stars.Sum(s=>(long)s.Ships[team])>10000))throw new RuleException("Existing fleet exceeds typed preview capacity.");
        foreach(var star in game.Stars)star.Fleets=[[star.Ships[0],0,0,0,0],[star.Ships[1],0,0,0,0]];
        game.CombatVersion=1;
    }
    public static void Sync(Star star){for(var team=0;team<2;team++)star.Ships[team]=star.Fleets![team].Sum();}
    public static string Describe(int[] composition)=>string.Join(", ",composition.Select((count,index)=>$"{count} {Name(index)}"));
    public static void Resolve(Game game,Star star,DateTimeOffset at)
    {
        var before=star.Fleets!.Select(f=>f.ToArray()).ToArray();var owner=star.Owner;var defense=star.Defense;
        var left=before[0].ToArray();var right=before[1].ToArray();
        // Fixed defenses use the interceptor counter profile, but never become ships.
        if(owner==0)left[0]+=defense;if(owner==1)right[0]+=defense;
        if(left.Sum()==0||right.Sum()==0)return;
        var result=CounterBattle.Resolve(new(left),new(right));
        star.Fleets=[result.Left.Counts,result.Right.Counts];
        if(owner is int defending)
        {
            var loss=before[defending][0]+defense-star.Fleets[defending][0];
            star.Defense=Math.Max(0,defense-loss);star.Fleets[defending][0]-=star.Defense;
        }
        Sync(star);
        for(var team=0;team<2;team++)
        {
            var losses=before[team].Zip(star.Fleets[team],(initial,remaining)=>initial-remaining).ToArray();
            game.Clans[team].Reports.Insert(0,$"Turn {game.Turn}, battle at {star.Name}: own hull losses [{Describe(losses)}]; own survivors [{Describe(star.Fleets[team])}]." +
                (owner==team?$" Fixed-defense strength lost: {defense-star.Defense}.":""));
            var enemy=1-team;var retained=star.Ships[team]>0||(owner==team&&star.Defense>0);
            game.Clans[team].Intelligence.Insert(0,new($"battle:{game.Turn}:{team}:{star.Id}",star.Id,game.Turn,at,"battle contact / before combat","battle",retained,true,
                retained,retained?owner:null,retained?Recon.Band(before[enemy].Sum()):null,retained?before[enemy].Sum():null,
                null,null,retained&&owner==enemy?defense:null,retained?before[enemy].ToArray():null));
        }
    }
    public static int ChooseHull(View view,StarView source)
    {
        var intel=view.Intelligence?.Where(i=>i.EnemyComposition!=null&&i.EnemyPresent==true&&view.Turn-i.Turn<=3&&Rules.Linked(source.Id,i.Star)).OrderByDescending(i=>i.Turn).ThenBy(i=>i.Id).FirstOrDefault();
        if(intel?.EnemyComposition is not {} composition||composition.Sum()==0)return 0;
        var dominant=Enumerable.Range(0,5).OrderByDescending(h=>composition[h]*Cost(h)).ThenBy(h=>h).First();
        return Enumerable.Range(0,5).Where(h=>CounterBattle.Counters((Hull)h,(Hull)dominant)).OrderBy(Cost).First();
    }
    public static List<Order> Plan(View view)
    {
        var orders=new List<Order>();var budget=view.Credits;var planned=new int[5];
        foreach(var star in view.Stars.Where(s=>s.Owner==view.Team).OrderBy(s=>s.Id))
        {
            if(star.Scouts![view.Team]==0&&budget>=3){orders.Add(new("scoutbuild",star.Id,Ships:1));budget-=3;}
            if(budget>=30){orders.Add(new("collector",star.Id));budget-=30;}
            var hull=star.Fleets![view.Team][0]<4?0:ChooseHull(view,star);
            var remaining=10000-view.Stars.Sum(s=>s.Fleets?[view.Team][hull]??0)-planned[hull];
            var count=Math.Min(2,Math.Min(remaining,budget/Cost(hull)));
            if(count>0){orders.Add(new("build",star.Id,Ships:count,Hull:Name(hull)));budget-=count*Cost(hull);planned[hull]+=count;}
            var target=view.Stars.Where(s=>s.Known&&Rules.Linked(star.Id,s.Id)&&s.Owner!=view.Team).OrderBy(s=>s.Id).FirstOrDefault();
            if(target==null)continue;
            if(star.Scouts[view.Team]>0)orders.Add(new("recon",star.Id,target.Id,1,"deep"));
            if(star.Fleets[view.Team][0]<4)continue; // Send habitat-capable escorts with specialists.
            for(var h=0;h<5;h++)
            {
                var moving=Math.Min(100,star.Fleets[view.Team][h]-(h==0?1:0));
                if(moving>0)orders.Add(new("move",star.Id,target.Id,moving,Hull:Name(h)));
            }
        }
        orders=orders.Take(24).ToList();Rules.Validate(view,orders);return orders;
    }
}
