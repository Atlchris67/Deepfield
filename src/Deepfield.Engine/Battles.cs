using Deepfield.Engine.Combat;

namespace Deepfield.Engine;

/// <summary>
/// The battle at one system when the fleets of clans that are not allied meet there.
/// <para>With two sides this is exactly the battle the game has always fought.</para>
/// <para>With three or four, everyone fights everyone who is not their ally. Each clan divides its force evenly between
/// the hostile clans present (any odd ship goes against the strongest; between equals the choice rotates), every pair fights at the same moment, and the
/// rounds repeat until no two hostile clans are left at the system. Allies never fight each other, and each ally fights
/// its own battles: allied fleets are not pooled.</para>
/// </summary>
public static class Battles
{
    public static void Resolve(Game g, Star s, DateTimeOffset at)
    {
        if (g.CombatVersion == 1) Typed(g, s, at);
        else Untyped(g, s, g.EconomyVersion == 1 || g.GeneratedMap?.RealCatalogVersion is not null);
    }

    static List<(int A, int B)> HostilePairs(Game g, List<int> present)
        => (from a in present from b in present where a < b && Alliances.Hostile(g, a, b) select (a, b)).ToList();

    // An even share for each enemy; the remainder goes one each to the strongest enemies first.
    static int[] Split(int total, int enemies)
    {
        var shares = Enumerable.Repeat(total / enemies, enemies).ToArray();
        for (var i = 0; i < total % enemies; i++) shares[i]++;
        return shares;
    }

    // Generic ships: each pair loses equally. A colony's fixed defenses fight beside its owner's ships and are lost first.
    static void Untyped(Game g, Star s, bool defenses)
    {
        var n = g.Clans.Count;
        // Between equally strong enemies the odd ship's target rotates by turn and system, so no clan is always picked first.
        var rotate = g.Turn + s.Id;
        int Strength(int t) => s.Ships[t] + (s.Owner == t ? s.Defense : 0);
        var shipLoss = new int[n]; var defenseLoss = new int[n]; var fought = new bool[n];
        while (true)
        {
            var present = Enumerable.Range(0, n).Where(t => Strength(t) > 0).ToList();
            var pairs = HostilePairs(g, present);
            if (pairs.Count == 0) break;
            var commit = new int[n, n];
            foreach (var t in present)
            {
                var enemies = present.Where(e => Alliances.Hostile(g, t, e)).OrderByDescending(Strength).ThenBy(e => (e + rotate) % n).ToList();
                if (enemies.Count == 0) continue;
                var shares = Split(Strength(t), enemies.Count);
                for (var i = 0; i < enemies.Count; i++) commit[t, enemies[i]] = shares[i];
            }
            var loss = new int[n];
            foreach (var (a, b) in pairs) { var both = Math.Min(commit[a, b], commit[b, a]); loss[a] += both; loss[b] += both; fought[a] = fought[b] = true; }
            // Very small forces can each face a different enemy and miss one another; then the first pair fights directly.
            if (loss.All(lost => lost == 0)) { var (a, b) = pairs[0]; loss[a] = loss[b] = Math.Min(Strength(a), Strength(b)); }
            for (var t = 0; t < n; t++)
            {
                var fromDefense = s.Owner == t ? Math.Min(s.Defense, loss[t]) : 0;
                s.Defense -= fromDefense; s.Ships[t] -= loss[t] - fromDefense;
                defenseLoss[t] += fromDefense; shipLoss[t] += loss[t] - fromDefense;
            }
        }
        for (var t = 0; t < n; t++)
            if (fought[t])
                g.Clans[t].Reports.Insert(0, defenses
                    ? $"Battle at {s.Name}: lost {shipLoss[t]} ships and {defenseLoss[t]} fixed-defense strength; {s.Ships[t]} ships remain."
                    : $"Battle at {s.Name}: lost {shipLoss[t]} ships; {s.Ships[t]} remain.");
    }

    // Ship types: each pair is decided by the counter battle. Fixed defenses fight as interceptors but never become ships.
    static void Typed(Game g, Star s, DateTimeOffset at)
    {
        var n = g.Clans.Count;
        // Between equally strong enemies the odd ship's target rotates by turn and system, so no clan is always picked first.
        var rotate = g.Turn + s.Id;
        var before = s.Fleets!.Select(f => f.ToArray()).ToArray(); var owner = s.Owner; var defense = s.Defense;
        int Strength(int t) => s.Fleets![t].Sum() + (s.Owner == t ? s.Defense : 0);
        var packages = g.Clans.Select(c => c.ShipDesigns.Select(ShipDesign.Index).ToArray()).ToArray();
        var fought = new bool[n];
        // Who each clan faced when the battle began, for its battle report.
        var began = Enumerable.Range(0, n).Where(t => Strength(t) > 0).ToList();
        while (true)
        {
            var present = Enumerable.Range(0, n).Where(t => Strength(t) > 0).ToList();
            var pairs = HostilePairs(g, present);
            if (pairs.Count == 0) break;
            var total = present.Sum(Strength);
            int[] Force(int t) { var force = s.Fleets![t].ToArray(); if (s.Owner == t) force[0] += s.Defense; return force; }
            var parts = new int[n, n][];
            var engaged = new List<int>();
            foreach (var t in present)
            {
                var enemies = present.Where(e => Alliances.Hostile(g, t, e)).OrderByDescending(Strength).ThenBy(e => (e + rotate) % n).ToList();
                if (enemies.Count == 0) continue;
                engaged.Add(t);
                var force = Force(t);
                foreach (var e in enemies) parts[t, e] = new int[5];
                for (var h = 0; h < 5; h++)
                {
                    var shares = Split(force[h], enemies.Count);
                    for (var i = 0; i < enemies.Count; i++) parts[t, enemies[i]][h] = shares[i];
                }
            }
            var survivors = engaged.ToDictionary(t => t, _ => new int[5]);
            void Fight(int a, int b, int[] left, int[] right)
            {
                var result = CounterBattle.Resolve(new(left), new(right), packages[a], packages[b]);
                for (var h = 0; h < 5; h++) { survivors[a][h] += result.Left.Counts[h]; survivors[b][h] += result.Right.Counts[h]; }
            }
            foreach (var (a, b) in pairs) { Fight(a, b, parts[a, b], parts[b, a]); fought[a] = fought[b] = true; }
            if (engaged.Sum(t => survivors[t].Sum()) == engaged.Sum(Strength))
            {
                // Nothing was lost because small forces missed one another: the first pair fights with everything it has.
                var (a, b) = pairs[0];
                survivors[a] = new int[5]; survivors[b] = new int[5];
                Fight(a, b, Force(a), Force(b));
                engaged = [a, b];
            }
            foreach (var t in engaged)
            {
                if (s.Owner == t)
                {
                    // Losses on the interceptor line come off the fixed defenses first.
                    var lost = s.Fleets![t][0] + s.Defense - survivors[t][0];
                    s.Defense = Math.Max(0, s.Defense - lost); survivors[t][0] -= s.Defense;
                }
                s.Fleets![t] = survivors[t];
            }
            TypedCombat.Sync(s);
            if (present.Sum(Strength) >= total) break; // Cannot happen; guards against an endless battle.
        }
        for (var team = 0; team < n; team++)
        {
            if (!fought[team]) continue;
            var losses = before[team].Zip(s.Fleets![team], (initial, remaining) => initial - remaining).ToArray();
            g.Clans[team].Reports.Insert(0, $"Turn {g.Turn}, battle at {s.Name}: own hull losses [{TypedCombat.Describe(losses)}]; own survivors [{TypedCombat.Describe(s.Fleets[team])}]." +
                (owner == team ? $" Fixed-defense strength lost: {defense - s.Defense}." : ""));
            var enemies = began.Where(e => Alliances.Hostile(g, team, e)).ToList();
            var enemyFleet = Enumerable.Range(0, 5).Select(h => enemies.Sum(e => before[e][h])).ToArray();
            var enemyOwner = owner is int held && enemies.Contains(held);
            var retained = s.Ships[team] > 0 || (owner == team && s.Defense > 0);
            g.Clans[team].Intelligence.Insert(0, new($"battle:{g.Turn}:{team}:{s.Id}", s.Id, g.Turn, at, "battle contact / before combat", "battle", retained, true,
                retained, retained ? owner : null, retained ? Recon.Band(enemyFleet.Sum()) : null, retained ? enemyFleet.Sum() : null,
                null, null, retained && enemyOwner ? defense : null, retained ? enemyFleet : null));
        }
    }
}
