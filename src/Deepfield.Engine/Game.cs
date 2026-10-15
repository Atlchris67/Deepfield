using System.Text.Json;
using System.Text.Json.Serialization;

namespace Deepfield.Engine;

public record Order(string Kind, int Source, int Target = -1, int Ships = 0,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Mission = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Hull = null);
public record Submission(int Turn, int Revision, string RequestId, List<Order> Orders);
public record Receipt(string Id, string Payload, int Revision);
public record Message(string Id, string Author, string Text, DateTimeOffset At);
public class Clan
{
    public string Name { get; set; } = "";
    public bool Ai { get; set; }
    public int Credits { get; set; } = 60;
    public int Revision { get; set; }
    public List<int> Known { get; set; } = [];
    public List<Order> Orders { get; set; } = [];
    public List<Receipt> Receipts { get; set; } = [];
    public List<string> Reports { get; set; } = [];
    public List<Message> Messages { get; set; } = [];
    public List<Intelligence> Intelligence { get; set; } = [];
}
public class Star
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public int X { get; set; }
    public int Y { get; set; }
    public int? Owner { get; set; }
    public int Collectors { get; set; }
    public int[] Ships { get; set; } = [0, 0];
    public int[] Scouts { get; set; } = [0, 0];
    public int Defense { get; set; }
    public int[][]? Fleets { get; set; }
}
public class Game
{
    public int Schema { get; set; } = 4;
    public int CombatVersion { get; set; }
    public int EconomyVersion { get; set; }
    public ReconRates ReconRates { get; set; } = new();
    public int Seed { get; set; }
    public int Turn { get; set; } = 1;
    public DateTimeOffset Deadline { get; set; }
    public int? Winner { get; set; }
    public List<Star> Stars { get; set; } = [];
    public List<Clan> Clans { get; set; } = [];
}
public record StarView(int Id, string Name, int X, int Y, bool Known, bool Visible, int? Owner, int? Collectors, int[]? Ships, int[]? Scouts = null, int? Defense = null, int[][]? Fleets = null);
public record View(int Turn, DateTimeOffset Deadline, int? Winner, int Team, string Name, int Credits, int Revision,
    List<Order> Orders, List<string> Reports, List<Message> Messages, List<StarView> Stars, int Energy, int Goal = 8,
    List<Intelligence>? Intelligence = null, ReconRates? ReconRates = null, int EconomyVersion = 0, int NextIncome = 0, int CombatVersion = 0);
public sealed class RuleException(string message) : Exception(message);

public static class Rules
{
    public static Game Create(int seed, DateTimeOffset now, bool ai = true, int economyVersion = 0, int combatVersion = 0)
    {
        if(economyVersion is not (0 or 1)) throw new RuleException("Unknown economy version.");
        if(combatVersion is not (0 or 1)) throw new RuleException("Unknown combat version.");
        var g = new Game { Seed = seed, EconomyVersion = economyVersion, Deadline = now.AddDays(1), Clans = [new() { Name = "Aurora Federation" }, new() { Name = "Ember Empire", Ai = ai }] };
        string[] names = ["Hearth", "Lumen", "Vesper", "Sable", "Meridian", "Halo", "Cinder", "Aster", "Drift", "Orison", "Cairn", "Dawn"];
        // Stable arithmetic layout, independent of runtime Random implementation.
        for (var i = 0; i < 12; i++) g.Stars.Add(new Star { Id = i, Name = names[i], X = 12 + i % 6 * 15, Y = 25 + i / 6 * 48 + (int)((uint)(seed + i * 7919) % 13) });
        for (var t = 0; t < 2; t++) { var s = g.Stars[t * 11]; s.Owner = t; s.Ships[t] = 8; s.Collectors = 1; Reveal(g, t, s.Id); }
        if(combatVersion==1) TypedCombat.Initialize(g);
        return g;
    }
    public static bool Linked(int a, int b) => a != b && (Math.Abs(a - b) == 1 || Math.Abs(a - b) == 6) && !(Math.Min(a,b) == 5 && Math.Max(a,b) == 6);
    static void Reveal(Game g, int team, int id)
    {
        foreach (var s in g.Stars.Where(s => s.Id == id || Linked(s.Id, id)))
            if (!g.Clans[team].Known.Contains(s.Id)) g.Clans[team].Known.Add(s.Id);
    }
    public static View Observe(Game g, int team)
    {
        var c = g.Clans[team];
        return new(g.Turn, g.Deadline, g.Winner, team, c.Name, c.Credits, c.Revision, [..c.Orders], [..c.Reports], [..c.Messages],
            g.Stars.Select(s => { var visible = s.Owner == team || s.Ships[team] > 0; var known = c.Known.Contains(s.Id);
                return new StarView(s.Id, known ? s.Name : "Uncharted", s.X, s.Y, known, visible, visible ? s.Owner : null, visible ? s.Collectors : null, visible ? [..s.Ships] : null, visible ? [..s.Scouts] : null, visible ? s.Defense : null, visible ? s.Fleets?.Select(f=>f.ToArray()).ToArray() : null); }).ToList(),
            g.Stars.Where(s => s.Owner == team).Sum(s => s.Collectors), Intelligence: [..c.Intelligence], ReconRates: g.ReconRates,
            EconomyVersion: g.EconomyVersion, NextIncome: g.Stars.Where(s=>s.Owner==team).Sum(s=>Economy.Income(g,s)), CombatVersion: g.CombatVersion);
    }
    public static void Validate(View v, List<Order> orders)
    {
        if (orders.Count > 24 || orders.Any(o => o is null)) throw new RuleException("Provide at most 24 non-null orders.");
        var cost = 0; var moved = new Dictionary<int,int>(); var scouts = new Dictionary<int,int>(); var defenses = new Dictionary<int,int>();
        var typedMoves=new Dictionary<(int,int),int>();var typedBuilds=new Dictionary<int,int>();
        foreach (var o in orders)
        {
            var s = v.Stars.SingleOrDefault(s => s.Id == o.Source);
            if (s is null || !s.Visible) throw new RuleException("Source is not under observation.");
            if(o.Hull!=null&&(v.CombatVersion!=1||o.Kind is not ("build" or "move")))throw new RuleException("Hull selection requires typed build/move orders.");
            switch (o.Kind)
            {
                case "defense":
                    if(v.EconomyVersion!=1 || s.Owner!=v.Team) throw new RuleException("Fixed defenses require an owned colony in economy version 1.");
                    defenses[s.Id]=defenses.GetValueOrDefault(s.Id)+2;
                    if((s.Defense??0)+defenses[s.Id]>6) throw new RuleException("Maximum defense strength is 6 per colony.");
                    cost+=8;break;
                case "scoutbuild":
                    if (s.Owner != v.Team || o.Ships < 1 || o.Ships > 100) throw new RuleException("Build 1–100 scouts at your colony.");
                    cost += o.Ships * 3; break;
                case "recon":
                    if (s.Owner != v.Team || o.Ships != 1 || !Recon.ValidMission(o.Mission) || !v.Stars.Any(t => t.Id == o.Target && t.Known) || !Linked(o.Source,o.Target))
                        throw new RuleException("Send one existing scout from your colony to a charted adjacent star; choose distant, close or deep.");
                    scouts[o.Source] = scouts.GetValueOrDefault(o.Source) + 1;
                    if (scouts[o.Source] > s.Scouts![v.Team]) throw new RuleException("Not enough existing scouts. New scouts fly next turn.");
                    break;
                case "build":
                    if (s.Owner != v.Team || o.Ships < 1 || o.Ships > 100) throw new RuleException("Build 1–100 ships at your colony.");
                    if(v.CombatVersion==1)
                    {
                        var hull=TypedCombat.Index(o.Hull);cost+=o.Ships*TypedCombat.Cost(hull);
                        typedBuilds[hull]=typedBuilds.GetValueOrDefault(hull)+o.Ships;
                        if(v.Stars.Sum(star=>star.Fleets?[v.Team][hull]??0)+typedBuilds[hull]>10000)throw new RuleException("Clan limit: 10,000 ships per hull class.");
                    }
                    else cost += o.Ships * 5;
                    break;
                case "collector":
                    if (s.Owner != v.Team) throw new RuleException("Collectors need your colony.");
                    cost += 30; break;
                case "move":
                    if (o.Ships < 1 || o.Ships > 100 || !v.Stars.Any(t => t.Id == o.Target && t.Known) || !Linked(o.Source,o.Target)) throw new RuleException("Move to a charted adjacent star with 1–100 ships.");
                    if(v.CombatVersion==1)
                    {
                        var hull=TypedCombat.Index(o.Hull);var key=(o.Source,hull);typedMoves[key]=typedMoves.GetValueOrDefault(key)+o.Ships;
                        if(typedMoves[key]>s.Fleets![v.Team][hull])throw new RuleException("Not enough existing ships of that hull. New ships move next turn.");
                    }
                    else {moved[o.Source] = moved.GetValueOrDefault(o.Source) + o.Ships;
                    if (moved[o.Source] > s.Ships![v.Team]) throw new RuleException("Not enough existing ships. New ships move next turn.");}
                    break;
                default: throw new RuleException("Unknown order type.");
            }
        }
        if (cost > v.Credits) throw new RuleException("Orders exceed treasury.");
    }
    public static int Submit(Game g, int team, Submission request, DateTimeOffset now)
    {
        var c = g.Clans[team];
        if (string.IsNullOrWhiteSpace(request.RequestId) || request.RequestId.Length > 80 || request.Orders is null) throw new RuleException("Request ID and orders required.");
        var payload = JsonSerializer.Serialize(new { request.Turn, request.Revision, request.Orders });
        var old = c.Receipts.Find(r => r.Id == request.RequestId);
        if (old is not null) { if (old.Payload != payload) throw new RuleException("Request ID already used with different content."); return old.Revision; }
        if (g.Winner != null || now >= g.Deadline || request.Turn != g.Turn) throw new RuleException("Turn closed.");
        if (request.Revision != c.Revision) throw new RuleException("Orders changed. Refresh before replacing them.");
        Validate(Observe(g,team), request.Orders);
        c.Orders = [..request.Orders]; c.Revision++;
        c.Receipts.Add(new(request.RequestId, payload, c.Revision));
        if (c.Receipts.Count > 256) c.Receipts.RemoveAt(0);
        return c.Revision;
    }
    public static List<Order> PlanAi(View v)
    {
        if(v.CombatVersion==1)return TypedCombat.Plan(v);
        var orders = new List<Order>(); var budget = v.Credits;
        foreach (var s in v.Stars.Where(s => s.Visible && s.Owner == v.Team).OrderBy(s => s.Id))
        {
            if(v.EconomyVersion==1 && s.Defense<=4 && budget>=8 && v.Intelligence!.Any(i=>i.EnemyPresent==true&&v.Turn-i.Turn<=2&&Linked(s.Id,i.Star)))
            {orders.Add(new("defense",s.Id));budget-=8;}
            if (s.Scouts![v.Team] == 0 && budget >= 3) { orders.Add(new("scoutbuild",s.Id,Ships:1)); budget -= 3; }
            if (budget >= 30) { orders.Add(new("collector",s.Id)); budget -= 30; }
            if (budget >= 10) { orders.Add(new("build",s.Id,Ships:2)); budget -= 10; }
            var target = v.Stars.Where(t => t.Known && Linked(s.Id,t.Id) && t.Owner != v.Team).OrderBy(t => t.Id).FirstOrDefault();
            if (target != null && s.Scouts[v.Team] > 0) orders.Add(new("recon",s.Id,target.Id,1,"distant"));
            // Keep one ship at home and respect the same per-order cap as humans.
            if (target != null && s.Ships![v.Team] >= 4) orders.Add(new("move",s.Id,target.Id,Math.Min(100,s.Ships[v.Team]-1)));
        }
        orders=orders.Take(24).ToList(); Validate(v, orders); return orders;
    }
    public static bool Resolve(Game g, DateTimeOffset now)
    {
        if (g.Winner != null || now < g.Deadline) return false;
        for (var t = 0; t < 2; t++)
        {
            var c = g.Clans[t];
            if (c.Ai) c.Orders = PlanAi(Observe(g,t));
            c.Reports.Insert(0,$"Turn {g.Turn}: {c.Orders.Count} orders executed.");
        }
        var delta = new int[12,2];
        var typedDelta=new int[12,2,5];
        for (var t = 0; t < 2; t++) foreach (var o in g.Clans[t].Orders)
        {
            var s = g.Stars[o.Source]; var c = g.Clans[t];
            if (o.Kind == "build") { if(g.CombatVersion==1){var hull=TypedCombat.Index(o.Hull);typedDelta[s.Id,t,hull]+=o.Ships;c.Credits-=TypedCombat.Cost(hull)*o.Ships;}else{delta[s.Id,t] += o.Ships; c.Credits -= 5 * o.Ships;} }
            if (o.Kind == "scoutbuild") { s.Scouts[t] += o.Ships; c.Credits -= 3 * o.Ships; }
            if (o.Kind == "defense") { s.Defense+=2;c.Credits-=8; }
            if (o.Kind == "collector") { s.Collectors++; c.Credits -= 30; }
            if (o.Kind == "move") { if(g.CombatVersion==1){var hull=TypedCombat.Index(o.Hull);typedDelta[s.Id,t,hull]-=o.Ships;typedDelta[o.Target,t,hull]+=o.Ships;}else{delta[s.Id,t] -= o.Ships; delta[o.Target,t] += o.Ships;} Reveal(g,t,o.Target); c.Reports.Insert(0,$"Fleet of {o.Ships} {(g.CombatVersion==1?TypedCombat.Name(TypedCombat.Index(o.Hull)):"ships")} reached {g.Stars[o.Target].Name}."); }
        }
        foreach (var s in g.Stars) for(var t=0;t<2;t++) s.Ships[t] += delta[s.Id,t];
        if(g.CombatVersion==1)foreach(var s in g.Stars){for(var t=0;t<2;t++)for(var h=0;h<5;h++)s.Fleets![t][h]+=typedDelta[s.Id,t,h];TypedCombat.Sync(s);}
        // All reconnaissance samples the same arrival snapshot, before combat.
        Recon.Resolve(g,now);
        foreach (var s in g.Stars)
        {
            if(g.CombatVersion==1)TypedCombat.Resolve(g,s,now);
            else if(g.EconomyVersion==1) Economy.Combat(g,s);
            else if(s.Ships[0]>0 && s.Ships[1]>0)
            {
                var lost = Math.Min(s.Ships[0],s.Ships[1]); s.Ships[0]-=lost; s.Ships[1]-=lost;
                for(var t=0;t<2;t++) g.Clans[t].Reports.Insert(0,$"Battle at {s.Name}: lost {lost} ships; {s.Ships[t]} remain.");
            }
            for(var t=0;t<2;t++) if(s.Ships[t]>0)
            {
                if(s.Owner != null && s.Owner != t) { var defender=s.Owner.Value; s.Owner=null; s.Collectors=0; s.Defense=0; s.Scouts[defender]=0; g.Clans[defender].Reports.Insert(0,$"Colony at {s.Name} was lost; grounded scouts destroyed."); }
                if(s.Owner == null && (g.CombatVersion==1?s.Fleets![t][0]:s.Ships[t])>=2) { if(g.CombatVersion==1){s.Fleets![t][0]-=2;TypedCombat.Sync(s);}else s.Ships[t]-=2; s.Owner=t; g.Clans[t].Reports.Insert(0,$"Founded colony at {s.Name}; two {(g.CombatVersion==1?"interceptors":"ships")} converted to habitats."); }
                Reveal(g,t,s.Id);
            }
        }
        var winners = new List<int>();
        for(var t=0;t<2;t++)
        {
            var c=g.Clans[t]; var owned=g.Stars.Where(s=>s.Owner==t).ToList();
            var income=owned.Sum(s=>Economy.Income(g,s)); c.Credits+=income;
            c.Reports.Insert(0,$"Turn {g.Turn} complete. Income {income}; {owned.Count} colonies; {owned.Sum(s=>s.Collectors)}/8 energy collectors.");
            if(owned.Count>=4 && owned.Sum(s=>s.Collectors)>=8) winners.Add(t);
            c.Orders.Clear(); c.Revision=0; c.Reports=c.Reports.Take(100).ToList();
            c.Intelligence=c.Intelligence.Take(200).ToList();
        }
        // Simultaneous victory is a shared victory, represented by team 2.
        if(winners.Count>0) g.Winner=winners.Count==2 ? 2 : winners[0];
        g.Turn++; g.Deadline=now.AddDays(1); return true;
    }
}
