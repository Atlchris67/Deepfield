namespace Deepfield.Engine;

/// <summary>
/// The computer player for campaigns that have a mode (simple or advanced). It plans from the same fogged view and
/// through the same validation as a person, so it has no hidden information and cannot break a rule.
/// Campaigns from before modes keep the original planners in <see cref="Rules.PlanAi"/> and <see cref="TypedCombat.Plan"/>.
/// </summary>
public static class Ai
{
    /// <summary>
    /// Hands a clan to the computer or back to its players. Only the campaign owner calls this; the computer never
    /// takes a clan over by itself, so a clan of people that misses a turn simply gives no orders that turn.
    /// Orders its players already submitted are kept, and are used again if the clan is handed back before the turn resolves.
    /// </summary>
    public static void SetControl(Game g, int team, bool computer)
    {
        if (team < 0 || team >= g.Clans.Count) throw new RuleException("Unknown clan.");
        var clan = g.Clans[team];
        if (clan.Ai == computer) return;
        clan.Ai = computer;
        // The computer makes no alliances, so unanswered offers to and from this clan are dropped. An alliance already agreed stands.
        if (computer) { clan.AllianceOffers.Clear(); foreach (var each in g.Clans) each.AllianceOffers.Remove(team); }
        var report = computer
            ? $"{clan.Name} is now played by the computer, as set by the campaign owner."
            : $"{clan.Name} is played by its players again, as set by the campaign owner.";
        foreach (var each in g.Clans) each.Reports.Insert(0, report);
    }

    const int Garrison = 4; // Ships a frontier colony gathers before it sends an expedition.
    const int Memory = 3;   // Turns for which a sighting of the other clan makes a system count as defended.

    public static List<Order> Plan(View v)
    {
        var typed = v.CombatVersion == 1; var industry = v.Mode == Modes.Advanced; var team = v.Team; var rule = v.Victory ?? new VictoryRule();
        var mine = v.Stars.Where(s => s.Visible && s.Owner == team).OrderBy(s => s.Id).ToList();
        var orders = new List<Order>(); var budget = v.Credits;
        // Every order is checked as it is added, so credits and materials are only counted for orders that will stand.
        bool Try(Order order, int credits)
        {
            if (orders.Count >= 24 || credits > budget) return false;
            try { Rules.Validate(v, [.. orders, order]); } catch (RuleException) { return false; }
            orders.Add(order); budget -= credits; return true;
        }
        var collectors = mine.Sum(s => s.Collectors ?? 0);
        var plannedHulls = new int[5];
        var basic = (typed ? TypedCombat.Cost(0) : 5) + v.IndustrialFocus;
        // First, across all colonies: a frontier colony tops up its expedition, so collector purchases can never starve expansion.
        var plans = mine.Select(s =>
        {
            var (target, relay) = Destination(v, s, mine);
            var frontier = target is not null && !relay;
            // Against a system where the other clan was met recently, gather a force that can win instead of feeding it four at a time.
            var sighting = frontier ? Sighting(v, target!.Id) : null;
            var needed = sighting is null ? Garrison : Math.Max(2 * Garrison, 2 * (sighting.EnemyShips ?? Garrison));
            var escorts = typed ? s.Fleets![team][0] : s.Ships![team];
            var built = 0;
            if (frontier && escorts < needed)
                for (var count = Math.Min(needed - escorts, budget / basic); count > 0 && built == 0; count--)
                    if (Try(new("build", s.Id, Ships: count, Hull: typed ? TypedCombat.Name(0) : null), count * basic)) built = count;
            plannedHulls[0] += built;
            return (Star: s, Target: target, Frontier: frontier, Needed: needed, Escorts: escorts, Built: built);
        }).ToList();
        // Then movement for every colony, before the remaining purchases can use up the limit of 24 orders a turn.
        foreach (var (s, target, frontier, needed, escorts, _) in plans)
        {
            if (target is null) continue;
            if (frontier && s.Scouts![team] > 0) Try(new("recon", s.Id, target.Id, 1, typed ? "deep" : "distant"), 0);
            // An interior colony forwards everything but one ship toward the frontier; a frontier colony waits for a full expedition.
            if (frontier && escorts < needed) continue;
            if (!typed) { var moving = Math.Min(100, s.Ships![team] - 1); if (moving > 0) Try(new("move", s.Id, target.Id, moving), 0); }
            else for (var h = 0; h < 5; h++)
            {
                var moving = Math.Min(100, s.Fleets![team][h] - (h == 0 ? 1 : 0));
                if (moving > 0) Try(new("move", s.Id, target.Id, moving, Hull: TypedCombat.Name(h)), 0);
            }
        }
        if (v.LogisticsVersion == 1 && collectors < rule.Collectors) Freight(v, mine, rule.Collectors - collectors, Try);
        foreach (var (s, _, _, needed, escorts, built) in plans)
        {
            if (v.EconomyVersion == 1 && s.Defense <= 4 &&
                v.Intelligence!.Any(i => i.EnemyPresent == true && v.Turn - i.Turn <= 2 && Rules.Linked(v, s.Id, i.Star)))
                Try(new("defense", s.Id), 8);
            // Collectors beyond the winning condition are worth buying only while they still add income (advanced mode, first three).
            if ((collectors < rule.Collectors || (v.EconomyVersion == 1 && s.Collectors < 3)) && Try(new("collector", s.Id), 30)) collectors++;
            // Scouts share a material with collectors in advanced mode, so collectors still owed come first.
            if (s.Scouts![team] == 0 && (s.AccessibleMaterials is null || s.AccessibleMaterials[2] > rule.Collectors - collectors))
                Try(new("scoutbuild", s.Id, Ships: 1), 3);
            var hull = !typed || escorts + built < needed ? 0 : TypedCombat.ChooseHull(v, s);
            if (built == 0 || hull != 0)
            {
                var unit = (typed ? TypedCombat.Cost(hull) : 5) + v.IndustrialFocus;
                var extra = Math.Min(budget / unit, Math.Clamp(budget / (4 * unit), 2, 12)); // Two a turn, more when rich.
                if (typed) extra = Math.Min(extra, 10000 - v.Stars.Sum(star => star.Fleets?[team][hull] ?? 0) - plannedHulls[hull]);
                for (; extra > 0; extra--)
                    if (Try(new("build", s.Id, Ships: extra, Hull: typed ? TypedCombat.Name(hull) : null), extra * unit)) { plannedHulls[hull] += extra; break; }
            }
            // Spare credits in advanced mode go into the colony's own output.
            if (industry && budget >= 60 && s.Mines < 4) Try(new("mine", s.Id), 12);
            if (industry && budget >= 100 && s.SettlementSize < 4) Try(new("settlement", s.Id), 20);
        }
        return orders;
    }

    const int Ceryth = 2, Soryl = 4; // The two materials a collector uses.

    // Advanced mode: a collector needs one Ceryth and one Soryl in the same colony's reach, and a homeworld starts with
    // enough for about eleven. When the collectors still owed need more, freighters carry both materials, one jump a turn,
    // to the colony that builds collectors. A freighter with nothing useful aboard heads for the nearest colony that has some.
    static void Freight(View v, List<StarView> mine, int owed, Func<Order, int, bool> attempt)
    {
        if (mine.Count < 2) return;
        var hub = mine.OrderByDescending(s => s.Collectors ?? 0).ThenByDescending(s => (s.AccessibleMaterials?[Ceryth] ?? 0) + (s.AccessibleMaterials?[Soryl] ?? 0)).ThenBy(s => s.Id).First();
        var wanted = new[] { Ceryth, Soryl }.Where(m => (hub.AccessibleMaterials?[m] ?? 0) < owed).ToArray();
        if (wanted.Length == 0) return;
        var network = Logistics.Access(v, hub.Id).Select(s => s.Id).ToHashSet();
        Dictionary<int, int> Hops(IEnumerable<StarView> from)
        {
            var hops = new Dictionary<int, int>(); var queue = new Queue<StarView>();
            foreach (var start in from) { hops[start.Id] = 0; queue.Enqueue(start); }
            while (queue.TryDequeue(out var at))
                foreach (var next in mine.Where(s => !hops.ContainsKey(s.Id) && Rules.Linked(v, at.Id, s.Id))) { hops[next.Id] = hops[at.Id] + 1; queue.Enqueue(next); }
            return hops;
        }
        int Useful(StarView s) => wanted.Sum(m => s.Stockpile?[m] ?? 0);
        var toHub = Hops(mine.Where(s => network.Contains(s.Id)));
        var sources = mine.Where(s => !network.Contains(s.Id) && toHub.ContainsKey(s.Id) && Useful(s) > 0).ToList();
        if (sources.Count == 0) return;
        // Sources nobody is serving yet: no freighter there, and none already on its way out.
        var unserved = sources.Where(s => (s.Freighters ?? 0) == 0).OrderBy(s => toHub[s.Id]).ThenBy(s => s.Id).ToList();
        var toSource = unserved.Count == 0 ? [] : Hops(unserved);
        StarView? Step(StarView from, Dictionary<int, int> hops) => !hops.TryGetValue(from.Id, out var here) || here == 0 ? null
            : mine.Where(s => Rules.Linked(v, from.Id, s.Id) && hops.TryGetValue(s.Id, out var there) && there < here).OrderBy(s => s.Id).FirstOrDefault();
        var outbound = mine.Where(s => !network.Contains(s.Id) && (s.Freighters ?? 0) > 0 && Useful(s) == 0).Sum(s => s.Freighters ?? 0);
        foreach (var s in mine.Where(s => (s.Freighters ?? 0) > 0 && s.Stockpile is not null && toHub.ContainsKey(s.Id)))
        {
            var freighters = s.Freighters!.Value; var cargo = new int[Materials.Count];
            if (!network.Contains(s.Id) && Useful(s) > 0)
            {
                // Homeward: as much of what is wanted as the freighters here can carry.
                var room = Math.Min(100, freighters * Logistics.FreighterCapacity);
                foreach (var m in wanted) { cargo[m] = Math.Min(room, Math.Min(s.Stockpile![m], owed)); room -= cargo[m]; }
                if (Step(s, toHub) is { } next) attempt(new("transport", s.Id, next.Id, (cargo.Sum() + Logistics.FreighterCapacity - 1) / Logistics.FreighterCapacity, Cargo: cargo), 0);
                continue;
            }
            // Outward: one freighter for each source that has none, carrying a token unit because a freighter cannot travel empty.
            var sending = network.Contains(s.Id) ? Math.Min(freighters, unserved.Count - outbound) : freighters;
            var token = Enumerable.Range(0, Materials.Count).Where(m => !wanted.Contains(m)).OrderByDescending(m => s.Stockpile![m]).First();
            if (sending <= 0 || s.Stockpile![token] == 0 || Step(s, toSource) is not { } outward) continue;
            cargo[token] = 1;
            if (attempt(new("transport", s.Id, outward.Id, sending, Cargo: cargo), 0) && network.Contains(s.Id)) outbound += sending;
        }
    }

    static Intelligence? Sighting(View v, int star) => v.Intelligence?.Where(i => i.Star == star && i.EnemyPresent == true && v.Turn - i.Turn <= Memory)
        .OrderByDescending(i => i.Turn).ThenByDescending(i => i.EnemyShips ?? 0).FirstOrDefault();

    // With inhabitants, a kinder world grows faster, so between otherwise equal targets the computer prefers the one its own
    // deep scouts reported as more habitable. A system it has no report for counts as average. It never reads the hidden score.
    static int Habitable(View v, int star) => v.Stars.All(s => s.Inhabitants is null) ? 0
        : v.Intelligence?.Where(i => i.Star == star && i.HabitabilityScore is not null).OrderByDescending(i => i.Turn).FirstOrDefault()?.HabitabilityScore ?? 50;

    // Where a colony's ships should go: an adjacent system the clan does not hold (empty ones first, recently defended ones last, more habitable ones before less), otherwise one
    // step along the shortest route through the clan's own colonies to a colony that has such a neighbour.
    static (StarView? Target, bool Relay) Destination(View v, StarView from, List<StarView> mine)
    {
        StarView? Frontier(StarView s) => v.Stars.Where(t => t.Known && t.Owner != v.Team && Rules.Linked(v, s.Id, t.Id))
            .OrderBy(t => t.Visible && t.Owner is null ? 0 : Sighting(v, t.Id) is null ? 1 : 2).ThenByDescending(t => Habitable(v, t.Id)).ThenBy(t => t.Id).FirstOrDefault();
        if (Frontier(from) is { } direct) return (direct, false);
        var firstStep = new Dictionary<int, StarView>(); var queue = new Queue<StarView>();
        foreach (var next in mine.Where(s => Rules.Linked(v, from.Id, s.Id))) { firstStep[next.Id] = next; queue.Enqueue(next); }
        while (queue.Count > 0)
        {
            var at = queue.Dequeue();
            if (Frontier(at) is not null) return (firstStep[at.Id], true);
            foreach (var next in mine.Where(s => s.Id != from.Id && !firstStep.ContainsKey(s.Id) && Rules.Linked(v, at.Id, s.Id)))
            { firstStep[next.Id] = firstStep[at.Id]; queue.Enqueue(next); }
        }
        return (null, false);
    }
}
