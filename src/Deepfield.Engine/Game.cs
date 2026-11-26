using System.Text.Json;
using System.Text.Json.Serialization;

namespace Deepfield.Engine;

public record Order(string Kind, int Source, int Target = -1, int Ships = 0,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Mission = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Hull = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] int[]? Cargo = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] int Scouts = 0,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Package = null);
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
    public int[]? Materials { get; set; }
    public int IndustrialFocus { get; set; }
    public string[] ShipDesigns { get; set; } = ShipDesign.Defaults();
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
    public int? HomePlanetId { get; set; }
    public int Mines { get; set; }
    public int SettlementSize { get; set; }
    public int[]? Stockpile { get; set; }
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public ColonyEnvironment? Environment { get; set; }
    public bool Gate { get; set; }
    public int[] Freighters { get; set; } = [0, 0];
}
public class Game
{
    public int Schema { get; set; } = 4;
    public int CombatVersion { get; set; }
    public int EconomyVersion { get; set; }
    public ReconRates ReconRates { get; set; } = new();
    public int Seed { get; set; }
    public string? ReconEntropy { get; set; }
    public int Turn { get; set; } = 1;
    public DateTimeOffset Deadline { get; set; }
    public int? Winner { get; set; }
    public List<Star> Stars { get; set; } = [];
    public List<Clan> Clans { get; set; } = [];
    public GeneratedStarMap? GeneratedMap { get; set; }
    public int LogisticsVersion { get; set; }
    // Zero is the original saved deposit/yield model. New real campaigns use version one.
    public int MaterialsVersion { get; set; }
}
public record StarView(int Id, string Name, int X, int Y, bool Known, bool Visible, int? Owner, int? Collectors, int[]? Ships, int[]? Scouts = null, int? Defense = null, int[][]? Fleets = null, PlanetStats? Statistics = null,
    int? Mines = null, int? SettlementSize = null, int? HomePlanetId = null, int[]? MaterialYield = null,
    int[]? Stockpile = null, bool? Gate = null, int? Freighters = null, int[]? AccessibleMaterials = null);
public record View(int Turn, DateTimeOffset Deadline, int? Winner, int Team, string Name, int Credits, int Revision,
    List<Order> Orders, List<string> Reports, List<Message> Messages, List<StarView> Stars, int Energy, int Goal = 8,
    List<Intelligence>? Intelligence = null, ReconRates? ReconRates = null, int EconomyVersion = 0, int NextIncome = 0, int CombatVersion = 0,
    IReadOnlyList<StarMapLink>? Links = null, int? MapWidth = null, int? MapHeight = null,
    int? RealCatalogVersion = null, IReadOnlyList<CatalogSystem>? RealSystems = null, int[]? Materials = null,
    int IndustrialFocus = 0, int LogisticsVersion = 0, string[]? ShipDesigns = null);
public sealed class RuleException(string message) : Exception(message);

public static class Rules
{
    public static Game Create(int seed, DateTimeOffset now, bool ai = true, int economyVersion = 0, int combatVersion = 0, string? reconEntropy = null)
    {
        if(economyVersion is not (0 or 1)) throw new RuleException("Unknown economy version.");
        if(combatVersion is not (0 or 1)) throw new RuleException("Unknown combat version.");
        var g = new Game { Seed = seed, EconomyVersion = economyVersion, ReconRates = ReconRates.NewCampaign, Deadline = now.AddDays(1), Clans = [new() { Name = "Aurora Federation" }, new() { Name = "Ember Empire", Ai = ai }] };
        g.ReconEntropy = reconEntropy ?? Recon.NewEntropy();
        Recon.ValidateEntropy(g.ReconEntropy);
        // Legacy topology: retain saved identities and rule-compatible IDs. Fresh Development games use RealStarMap.
        string[] names = ["Hearth", "Lumen", "Vesper", "Sable", "Meridian", "Halo", "Cinder", "Aster", "Drift", "Orison", "Cairn", "Dawn"];
        // Stable arithmetic layout, independent of runtime Random implementation.
        for (var i = 0; i < 12; i++) g.Stars.Add(new Star { Id = i, Name = names[i], X = 12 + i % 6 * 15, Y = 25 + i / 6 * 48 + (int)((uint)(seed + i * 7919) % 13) });
        for (var t = 0; t < 2; t++) { var s = g.Stars[t * 11]; s.Owner = t; s.Ships[t] = 8; s.Collectors = 1; Reveal(g, t, s.Id); }
        if(combatVersion==1) TypedCombat.Initialize(g);
        return g;
    }
    public static Game CreateFromMap(GeneratedStarMap map, DateTimeOffset now, bool ai = true, int economyVersion = 0, int combatVersion = 0,
        int logisticsVersion = 0, int[]? industrialFocus = null, string? reconEntropy = null)
    {
        if (logisticsVersion is not (0 or 1) || (logisticsVersion == 1 && map.RealCatalogVersion is null))
            throw new RuleException("Local logistics requires a real-system campaign.");
        industrialFocus ??= [0, 0];
        if (industrialFocus.Length != 2 || industrialFocus.Any(focus => focus is < -2 or > 2) ||
            (map.RealCatalogVersion is null && industrialFocus.Any(focus => focus != 0)))
            throw new RuleException("Clan industrial focus must be between -2 and 2 in a real-system campaign.");
        if (map.GeneratorVersion != StarMapGenerator.CurrentVersion || map.Settings.PlayerCount != 2 || map.Settings.SystemCount < 4)
            throw new RuleException("Playable campaigns require a current two-player star map with at least four systems.");
        var expected = map.RealCatalogVersion is null ? StarMapGenerator.Generate(map.Seed, map.Settings) : RealStarMap.Generate();
        if (!System.Text.Json.JsonSerializer.Serialize(expected).Equals(System.Text.Json.JsonSerializer.Serialize(map), StringComparison.Ordinal))
            throw new RuleException("Star map snapshot does not match its generator settings.");
        // Initialize typed fleets only after replacing the legacy layout with this map.
        var game = Create(map.Seed, now, ai, economyVersion, combatVersion: 0, reconEntropy: reconEntropy);
        game.GeneratedMap = map;
        game.LogisticsVersion = logisticsVersion;
        game.MaterialsVersion = map.RealCatalogVersion is null ? 0 : 1;
        for (var team = 0; team < 2; team++) game.Clans[team].IndustrialFocus = industrialFocus[team];
        if (map.RealCatalogVersion is not null && logisticsVersion == 0)
            foreach (var clan in game.Clans) clan.Materials = Materials.StartingStock();
        var homeworlds = map.Homeworlds.Select(home => home.SystemId).ToHashSet();
        game.Stars = map.Systems.Select(s => new Star
        {
            Id = s.Id, Name = s.Name, X = s.X, Y = s.Y,
            Environment = map.RealCatalogVersion is not null ? Habitability.Generate(game.ReconEntropy!, s.Id, homeworlds.Contains(s.Id)) : null
        }).ToList();
        foreach (var clan in game.Clans) clan.Known.Clear();
        foreach (var home in map.Homeworlds)
        {
            var star = game.Stars[home.SystemId];
            star.Owner = home.PlayerSlot; star.Ships[home.PlayerSlot] = 8; star.Collectors = 1;
            star.HomePlanetId = home.PlanetId;
            if (map.RealCatalogVersion is not null) { star.Mines = 1; star.SettlementSize = 2; }
            if (logisticsVersion == 1) { star.Stockpile = Materials.StartingStock(); star.Gate = true; star.Freighters[home.PlayerSlot] = 2; }
            Reveal(game, home.PlayerSlot, star.Id);
        }
        if (combatVersion == 1) TypedCombat.Initialize(game);
        return game;
    }
    public static bool Linked(int a, int b) => a != b && (Math.Abs(a - b) == 1 || Math.Abs(a - b) == 6) && !(Math.Min(a,b) == 5 && Math.Max(a,b) == 6);
    public static bool Linked(Game game, int a, int b) => game.GeneratedMap is null ? Linked(a,b) : game.GeneratedMap.Links.Any(link => link.From == Math.Min(a,b) && link.To == Math.Max(a,b));
    public static bool Linked(View view, int a, int b) => view.Links is null ? Linked(a,b) : view.Links.Any(link => link.From == Math.Min(a,b) && link.To == Math.Max(a,b));
    static void Reveal(Game g, int team, int id)
    {
        foreach (var s in g.Stars.Where(s => s.Id == id || Linked(g,s.Id, id)))
            if (!g.Clans[team].Known.Contains(s.Id)) g.Clans[team].Known.Add(s.Id);
    }
    public static View Observe(Game g, int team)
    {
        var c = g.Clans[team];
        var access = g.LogisticsVersion == 1 ? Logistics.Capture(g) : null;
        return new(g.Turn, g.Deadline, g.Winner, team, c.Name, c.Credits, c.Revision, [..c.Orders], [..c.Reports], [..c.Messages],
            g.Stars.Select(s => { var visible = s.Owner == team || s.Ships[team] > 0; var known = c.Known.Contains(s.Id);
                var star = new StarView(s.Id, known || g.GeneratedMap?.RealCatalogVersion != null ? s.Name : "Uncharted", s.X, s.Y, known, visible, visible ? s.Owner : null, visible ? s.Collectors : null, visible ? [..s.Ships] : null, visible ? [..s.Scouts] : null, visible ? s.Defense : null, visible ? s.Fleets?.Select(f=>f.ToArray()).ToArray() : null,
                    Mines: visible ? s.Mines : null, SettlementSize: visible ? s.SettlementSize : null, HomePlanetId: visible ? s.HomePlanetId : null,
                    MaterialYield: visible && s.Owner == team && g.GeneratedMap is { RealCatalogVersion: not null } ? Materials.Production(g, s) : null,
                    Stockpile: s.Owner == team ? s.Stockpile?.ToArray() : null,
                    Gate: visible ? s.Gate : null,
                    Freighters: s.Owner == team ? s.Freighters[team] : null,
                    AccessibleMaterials: s.Owner == team && access is not null
                        ? Enumerable.Range(0, Materials.Count).Select(i => access[(team, s.Id)].Sum(source => source.Stockpile![i])).ToArray()
                        : null);
                return star with { Statistics = PlanetStatistics.Project(star, c.Intelligence, team, g.Turn, g.EconomyVersion) }; }).ToList(),
            g.Stars.Where(s => s.Owner == team).Sum(s => s.Collectors), Intelligence: [..c.Intelligence], ReconRates: g.ReconRates,
            EconomyVersion: g.EconomyVersion, NextIncome: g.Stars.Where(s=>s.Owner==team).Sum(s=>Economy.Income(g,s)), CombatVersion: g.CombatVersion,
            Links: g.GeneratedMap?.Links, MapWidth: g.GeneratedMap?.Settings.Width, MapHeight: g.GeneratedMap?.Settings.Height,
            RealCatalogVersion: g.GeneratedMap?.RealCatalogVersion,
            RealSystems: g.GeneratedMap?.RealSystems?.Select(host => host with { Planets = c.Known.Contains(host.Id) ? host.Planets : [] }).ToArray(),
            Materials: c.Materials?.ToArray(), IndustrialFocus: c.IndustrialFocus, LogisticsVersion: g.LogisticsVersion,
            ShipDesigns: [..c.ShipDesigns]);
    }
    public static void Validate(View v, List<Order> orders)
    {
        if (orders.Count > 24 || orders.Any(o => o is null)) throw new RuleException("Provide at most 24 non-null orders.");
        var cost = 0; var moved = new Dictionary<int,int>(); var scouts = new Dictionary<int,int>(); var defenses = new Dictionary<int,int>();
        var typedMoves=new Dictionary<(int,int),int>();var typedBuilds=new Dictionary<int,int>();
        var materialCost = new int[Materials.Count];
        var mines = new Dictionary<int,int>(); var settlements = new Dictionary<int,int>();
        var networkCost = new Dictionary<int,int[]>(); var freighterMoves = new Dictionary<int,int>(); var gates = new HashSet<int>(); var refits = new HashSet<int>();
        foreach (var o in orders)
        {
            var s = v.Stars.SingleOrDefault(s => s.Id == o.Source);
            if (s is null || !s.Visible) throw new RuleException("Source is not under observation.");
            if (o.Scouts < 0 || o.Scouts > 100 || (o.Scouts > 0 && o.Kind != "move"))
                throw new RuleException("Only an expedition can carry 1-100 scouts.");
            if(o.Hull!=null&&(v.CombatVersion!=1||o.Kind is not ("build" or "move" or "refit")))throw new RuleException("Hull selection requires typed build, move or refit orders.");
            if(o.Package!=null&&o.Kind!="refit")throw new RuleException("Ship packages require a refit order.");
            if (o.Cargo is not null && o.Kind != "transport") throw new RuleException("Cargo is only valid for transport orders.");
            if (o.Kind == "transport" && (o.Cargo is not { Length: Materials.Count } || o.Cargo.Any(amount => amount < 0 || amount > 10000)))
                throw new RuleException("Transport requires six nonnegative material quantities.");
            if (v.RealCatalogVersion is not null)
            {
                var required = Materials.Cost(o);
                if (o.Kind == "transport")
                    for (var i = 0; i < Materials.Count; i++) required[i] += o.Cargo![i];
                var access = v.LogisticsVersion == 1 ? Logistics.Access(v, s.Id) : null;
                var reserved = v.LogisticsVersion == 1
                    ? networkCost.TryGetValue(access![0].Id, out var prior) ? prior : networkCost[access[0].Id] = new int[Materials.Count]
                    : materialCost;
                for (var i = 0; i < Materials.Count; i++)
                {
                    reserved[i] += required[i];
                    var available = v.LogisticsVersion == 1 ? access!.Sum(star => star.Stockpile?[i] ?? 0) : (v.Materials?[i] ?? 0);
                    if (reserved[i] > available)
                        throw new RuleException($"Insufficient {Materials.Names[i]} for orders.");
                }
            }
            switch (o.Kind)
            {
                case "refit":
                    if (v.CombatVersion != 1 || s.Owner != v.Team || o.Hull is null || o.Package is null || o.Ships != 0)
                        throw new RuleException("Choose a hull package at your colony.");
                    var designHull = TypedCombat.Index(o.Hull);
                    ShipDesign.Index(o.Package);
                    if (!refits.Add(designHull)) throw new RuleException("Only one package change per hull each turn.");
                    if ((v.ShipDesigns ?? ShipDesign.Defaults())[designHull] == o.Package) throw new RuleException("That hull already uses this package.");
                    cost += ShipDesign.AdoptionCredits;
                    break;
                case "defense":
                    if((v.EconomyVersion!=1 && v.RealCatalogVersion is null) || s.Owner!=v.Team) throw new RuleException("Fixed defenses require an owned colony.");
                    defenses[s.Id]=defenses.GetValueOrDefault(s.Id)+2;
                    if((s.Defense??0)+defenses[s.Id]>6) throw new RuleException("Maximum defense strength is 6 per colony.");
                    cost+=8;break;
                case "scoutbuild":
                    if (s.Owner != v.Team || o.Ships < 1 || o.Ships > 100) throw new RuleException("Build 1–100 scouts at your colony.");
                    cost += o.Ships * 3; break;
                case "recon":
                    if (s.Owner != v.Team || o.Ships != 1 || !Recon.ValidMission(o.Mission) || !v.Stars.Any(t => t.Id == o.Target && t.Known) || !Linked(v,o.Source,o.Target))
                        throw new RuleException("Send one existing scout from your colony to a charted adjacent star; choose distant, close or deep.");
                    scouts[o.Source] = scouts.GetValueOrDefault(o.Source) + 1;
                    if (scouts[o.Source] > s.Scouts![v.Team]) throw new RuleException("Not enough existing scouts. New scouts fly next turn.");
                    break;
                case "build":
                    if (s.Owner != v.Team || o.Ships < 1 || o.Ships > 100) throw new RuleException("Build 1–100 ships at your colony.");
                    if(v.CombatVersion==1)
                    {
                        var hull=TypedCombat.Index(o.Hull);cost+=o.Ships*(TypedCombat.Cost(hull)+v.IndustrialFocus);
                        typedBuilds[hull]=typedBuilds.GetValueOrDefault(hull)+o.Ships;
                        if(v.Stars.Sum(star=>star.Fleets?[v.Team][hull]??0)+typedBuilds[hull]>10000)throw new RuleException("Clan limit: 10,000 ships per hull class.");
                    }
                    else cost += o.Ships * (5 + v.IndustrialFocus);
                    break;
                case "collector":
                    if (s.Owner != v.Team) throw new RuleException("Collectors need your colony.");
                    cost += 30; break;
                case "mine":
                    if (v.RealCatalogVersion is null || s.Owner != v.Team) throw new RuleException("Mines require an owned real-system colony.");
                    mines[s.Id] = mines.GetValueOrDefault(s.Id) + 1;
                    if ((s.Mines ?? 0) + mines[s.Id] > 4) throw new RuleException("Maximum four mines per system.");
                    cost += 12; break;
                case "settlement":
                    if (v.RealCatalogVersion is null || s.Owner != v.Team) throw new RuleException("Settlement growth requires an owned real-system colony.");
                    settlements[s.Id] = settlements.GetValueOrDefault(s.Id) + 1;
                    if ((s.SettlementSize ?? 0) + settlements[s.Id] > 4) throw new RuleException("Maximum settlement size is four.");
                    cost += 20; break;
                case "freighter":
                    if (v.LogisticsVersion != 1 || s.Owner != v.Team || o.Ships is < 1 or > 10)
                        throw new RuleException("Build 1-10 freighters at your local-logistics colony.");
                    cost += 10 * o.Ships; break;
                case "gate":
                    if (v.LogisticsVersion != 1 || s.Owner != v.Team || s.Gate == true || !gates.Add(s.Id))
                        throw new RuleException("Build one gate at an owned system without an operational gate.");
                    cost += 30; break;
                case "transport":
                    if (v.LogisticsVersion != 1 || s.Owner != v.Team || o.Ships is < 1 or > 10 ||
                        !v.Stars.Any(star => star.Id == o.Target && star.Owner == v.Team) || !Linked(v, s.Id, o.Target) ||
                        o.Cargo!.Sum(amount => (long)amount) is <= 0 or > 100)
                        throw new RuleException("Transport positive cargo to a linked owned system using 1-10 freighters.");
                    if (o.Cargo!.Sum() > o.Ships * Logistics.FreighterCapacity)
                        throw new RuleException("Cargo exceeds freighter capacity.");
                    freighterMoves[s.Id] = freighterMoves.GetValueOrDefault(s.Id) + o.Ships;
                    if (freighterMoves[s.Id] > (s.Freighters ?? 0)) throw new RuleException("Not enough existing freighters at source.");
                    break;
                case "move":
                    if (o.Ships < 1 || o.Ships > 100 || !v.Stars.Any(t => t.Id == o.Target && t.Known) || !Linked(v,o.Source,o.Target)) throw new RuleException("Move to a charted adjacent star with 1-100 ships.");
                    if (o.Scouts > 0 && s.Owner != v.Team) throw new RuleException("Scouts must depart from your colony.");
                    scouts[o.Source] = scouts.GetValueOrDefault(o.Source) + o.Scouts;
                    if (scouts[o.Source] > s.Scouts![v.Team]) throw new RuleException("Not enough existing scouts for expeditions and reconnaissance. New scouts travel next turn.");
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
            if(v.EconomyVersion==1 && s.Defense<=4 && budget>=8 && v.Intelligence!.Any(i=>i.EnemyPresent==true&&v.Turn-i.Turn<=2&&Linked(v,s.Id,i.Star)))
            {orders.Add(new("defense",s.Id));budget-=8;}
            if (s.Scouts![v.Team] == 0 && budget >= 3) { orders.Add(new("scoutbuild",s.Id,Ships:1)); budget -= 3; }
            if (budget >= 30) { orders.Add(new("collector",s.Id)); budget -= 30; }
            if (budget >= 2 * (5 + v.IndustrialFocus)) { orders.Add(new("build",s.Id,Ships:2)); budget -= 2 * (5 + v.IndustrialFocus); }
            var target = v.Stars.Where(t => t.Known && Linked(v,s.Id,t.Id) && t.Owner != v.Team).OrderBy(t => t.Id).FirstOrDefault();
            if (target != null && s.Scouts[v.Team] > 0) orders.Add(new("recon",s.Id,target.Id,1,"distant"));
            // Keep one ship at home and respect the same per-order cap as humans.
            if (target != null && s.Ships![v.Team] >= 4) orders.Add(new("move",s.Id,target.Id,Math.Min(100,s.Ships[v.Team]-1)));
        }
        orders=orders.Take(24).ToList();
        if (v.RealCatalogVersion is not null)
        {
            var affordable = new List<Order>();
            foreach (var order in orders)
            {
                try { Validate(v, [..affordable, order]); affordable.Add(order); }
                catch (RuleException) { /* AI skips orders its material stock cannot support. */ }
            }
            return affordable;
        }
        Validate(v, orders); return orders;
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
        var delta = new int[g.Stars.Count,2];
        var typedDelta=new int[g.Stars.Count,2,5];
        var access = g.LogisticsVersion == 1 ? Logistics.Capture(g) : null;
        var transfers = new List<(int Team, int Target, int Ships, int[] Cargo)>();
        var scoutTransports = new List<(int Team, int Target, int Scouts)>();
        var refits = new List<(int Team, int Hull, string Package)>();
        for (var t = 0; t < 2; t++) foreach (var o in g.Clans[t].Orders)
        {
            var s = g.Stars[o.Source]; var c = g.Clans[t];
            var required = Materials.Cost(o);
            if (o.Kind == "transport") for (var i = 0; i < Materials.Count; i++) required[i] += o.Cargo![i];
            if (c.Materials is not null)
            {
                for (var i = 0; i < Materials.Count; i++) c.Materials[i] -= required[i];
            }
            else if (access is not null) Logistics.Spend(access[(t, s.Id)], required);
            if (o.Kind == "build") { if(g.CombatVersion==1){var hull=TypedCombat.Index(o.Hull);typedDelta[s.Id,t,hull]+=o.Ships;c.Credits-=(TypedCombat.Cost(hull)+c.IndustrialFocus)*o.Ships;}else{delta[s.Id,t] += o.Ships; c.Credits -= (5 + c.IndustrialFocus) * o.Ships;} }
            if (o.Kind == "scoutbuild") { s.Scouts[t] += o.Ships; c.Credits -= 3 * o.Ships; }
            if (o.Kind == "defense") { s.Defense+=2;c.Credits-=8; }
            if (o.Kind == "collector") { s.Collectors++; c.Credits -= 30; }
            if (o.Kind == "mine") { s.Mines++; c.Credits -= 12; }
            if (o.Kind == "settlement") { s.SettlementSize++; c.Credits -= 20; }
            if (o.Kind == "freighter") { s.Freighters[t] += o.Ships; c.Credits -= 10 * o.Ships; }
            if (o.Kind == "gate") { s.Gate = true; c.Credits -= 30; }
            if (o.Kind == "refit") { c.Credits -= ShipDesign.AdoptionCredits; refits.Add((t,TypedCombat.Index(o.Hull),o.Package!)); }
            if (o.Kind == "transport") { s.Freighters[t] -= o.Ships; transfers.Add((t, o.Target, o.Ships, o.Cargo!.ToArray())); }
            if (o.Kind == "move") { if(g.CombatVersion==1){var hull=TypedCombat.Index(o.Hull);typedDelta[s.Id,t,hull]-=o.Ships;typedDelta[o.Target,t,hull]+=o.Ships;}else{delta[s.Id,t] -= o.Ships; delta[o.Target,t] += o.Ships;} if(o.Scouts>0){s.Scouts[t]-=o.Scouts;scoutTransports.Add((t,o.Target,o.Scouts));} Reveal(g,t,o.Target); c.Reports.Insert(0,$"Fleet of {o.Ships} {(g.CombatVersion==1?TypedCombat.Name(TypedCombat.Index(o.Hull)):"ships")} reached {g.Stars[o.Target].Name}."); }
        }
        foreach (var s in g.Stars) for(var t=0;t<2;t++) s.Ships[t] += delta[s.Id,t];
        if(g.CombatVersion==1)foreach(var s in g.Stars){for(var t=0;t<2;t++)for(var h=0;h<5;h++)s.Fleets![t][h]+=typedDelta[s.Id,t,h];TypedCombat.Sync(s);}
        // All reconnaissance samples the same arrival snapshot, before combat.
        Recon.Resolve(g,now);
        var scoutLandingSites = new HashSet<(int Team, int Star)>();
        foreach (var s in g.Stars)
        {
            if(g.CombatVersion==1)TypedCombat.Resolve(g,s,now);
            else if(g.EconomyVersion==1 || g.GeneratedMap?.RealCatalogVersion is not null) Economy.Combat(g,s);
            else if(s.Ships[0]>0 && s.Ships[1]>0)
            {
                var lost = Math.Min(s.Ships[0],s.Ships[1]); s.Ships[0]-=lost; s.Ships[1]-=lost;
                for(var t=0;t<2;t++) g.Clans[t].Reports.Insert(0,$"Battle at {s.Name}: lost {lost} ships; {s.Ships[t]} remain.");
            }
            for(var t=0;t<2;t++) if(s.Ships[t]>0)
            {
                if(s.Owner != null && s.Owner != t) { var defender=s.Owner.Value; s.Owner=null; s.Collectors=0; s.Defense=0; s.Scouts[defender]=0; s.Mines=0; s.SettlementSize=0; s.Stockpile=null; s.Gate=false; s.Freighters=[0,0]; g.Clans[defender].Reports.Insert(0,$"Colony at {s.Name} was lost; grounded scouts destroyed."); }
                if(s.Owner == null && (g.CombatVersion==1?s.Fleets![t][0]:s.Ships[t])>=2) { if(g.CombatVersion==1){s.Fleets![t][0]-=2;TypedCombat.Sync(s);}else s.Ships[t]-=2; s.Owner=t; if(g.GeneratedMap?.RealCatalogVersion is not null) s.SettlementSize=1; if(g.LogisticsVersion==1) s.Stockpile=new int[Materials.Count]; g.Clans[t].Reports.Insert(0,$"Founded colony at {s.Name}; two {(g.CombatVersion==1?"interceptors":"ships")} converted to habitats."); }
                if (s.Owner == t) scoutLandingSites.Add((t,s.Id));
                Reveal(g,t,s.Id);
            }
        }
        foreach (var transport in scoutTransports)
        {
            var destination = g.Stars[transport.Target];
            if (destination.Owner == transport.Team && scoutLandingSites.Contains((transport.Team, transport.Target)))
            {
                destination.Scouts[transport.Team] += transport.Scouts;
                g.Clans[transport.Team].Reports.Insert(0,$"{transport.Scouts} scouts landed at {destination.Name} and can fly reconnaissance next turn.");
            }
            else g.Clans[transport.Team].Reports.Insert(0,$"{transport.Scouts} scouts bound for {destination.Name} were lost; no surviving colony fleet could receive them.");
        }
        foreach (var transfer in transfers)
        {
            var destination = g.Stars[transfer.Target];
            if (destination.Owner != transfer.Team || destination.Stockpile is null)
            {
                g.Clans[transfer.Team].Reports.Insert(0,$"Freighter convoy to {destination.Name} was lost before delivery.");
                continue;
            }
            destination.Freighters[transfer.Team] += transfer.Ships;
            for (var i = 0; i < Materials.Count; i++) destination.Stockpile[i] += transfer.Cargo[i];
        }
        foreach (var refit in refits)
        {
            g.Clans[refit.Team].ShipDesigns[refit.Hull] = refit.Package;
            g.Clans[refit.Team].Reports.Insert(0,$"{TypedCombat.Name(refit.Hull)} fleet package changed to {refit.Package}; active next turn.");
        }
        var winners = new List<int>();
        for(var t=0;t<2;t++)
        {
            var c=g.Clans[t]; var owned=g.Stars.Where(s=>s.Owner==t).ToList();
            var income=owned.Sum(s=>Economy.Income(g,s)); c.Credits+=income;
            if (c.Materials is not null && g.GeneratedMap is { RealCatalogVersion: not null })
            {
                foreach (var star in owned)
                {
                    var output = Materials.Production(g, star);
                    for (var i = 0; i < Materials.Count; i++) c.Materials[i] += output[i];
                }
            }
            else if (g.LogisticsVersion == 1)
            {
                foreach (var star in owned)
                {
                    var output = Materials.Production(g, star);
                    for (var i = 0; i < Materials.Count; i++) star.Stockpile![i] += output[i];
                }
            }
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
