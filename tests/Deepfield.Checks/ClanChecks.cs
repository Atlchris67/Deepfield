using System.Text.Json;
using Deepfield.Api;
using Deepfield.Engine;

/// <summary>Seasons with three or four clans, many-sided battles and alliances.</summary>
public static class ClanChecks
{
    public static void Run()
    {
        var count = 0; var now = DateTimeOffset.Parse("2026-11-28T12:00:00Z");
        void Check(bool ok, string label) { if (!ok) throw new Exception(label); count++; Console.WriteLine("PASS " + label); }
        bool Refused(Action action) { try { action(); return false; } catch (RuleException) { return true; } }
        bool Invalid(Game game) { try { GameCodec.Read(JsonSerializer.Serialize(game)); return false; } catch (InvalidOperationException) { return true; } }
        Game Copy(Game game) => GameCodec.Read(JsonSerializer.Serialize(game));
        Game New(int clans, string mode = Modes.Simple, int seed = 21) => Modes.Create(RealStarMap.Generate(seed, clans), now, false, mode);
        Star Home(Game g, int team) => g.Stars.First(s => s.Owner == team && s.HomePlanetId is not null);
        // A system nobody holds and nobody's home borders, so nothing else happens there during a check.
        Star Empty(Game g) => g.Stars.First(s => s.Owner is null && g.Stars.Where(o => o.Owner is not null).All(o => !Rules.Linked(g, o.Id, s.Id)));
        void Turn(Game g) => Rules.Resolve(g, g.Deadline);

        // Maps.
        var worst = 0; var mapsOk = true; var closest = int.MaxValue;
        foreach (var clans in new[] { 3, 4 })
            for (var seed = 1; seed <= 60; seed++)
            {
                var map = RealStarMap.Generate(seed, clans);
                var links = map.Links.Select(l => (l.From, l.To)).ToList();
                var hops = map.Homeworlds.Select(h => RealStarMap.Hops(map.Systems.Count, links, h.SystemId)).ToArray();
                var separation = (from a in Enumerable.Range(0, clans) from b in Enumerable.Range(0, clans) where a < b select hops[a][map.Homeworlds[b].SystemId]).Min();
                closest = Math.Min(closest, separation); worst = Math.Max(worst, RealStarMap.Imbalance(hops));
                mapsOk &= map.Homeworlds.Count == clans && map.Homeworlds.Select(h => h.SystemId).Distinct().Count() == clans && separation >= 2 &&
                          map.Homeworlds.Select(h => h.PlayerSlot).SequenceEqual(Enumerable.Range(0, clans)) && map.Settings.PlayerCount == clans &&
                          JsonSerializer.Serialize(map) == JsonSerializer.Serialize(RealStarMap.Generate(seed, clans));
            }
        Console.WriteLine($"INFO maps for 3 and 4 clans: closest homeworlds {closest} hops apart, worst imbalance {worst}");
        Check(mapsOk, "Every seeded map for three or four clans gives each clan its own homeworld, never next to another, and is the same map every time");
        Check(JsonSerializer.Serialize(RealStarMap.Generate(21)) == JsonSerializer.Serialize(RealStarMap.Generate(21, 2)) && Refused(() => RealStarMap.Generate(21, 5)) && Refused(() => RealStarMap.Generate(21, 1)),
            "A two-clan map is unchanged, and a map for one clan or five is refused");
        var firstHomes = Enumerable.Range(1, 60).Select(seed => RealStarMap.Generate(seed, 4).Homeworlds[0].SystemId).Distinct().Count();
        Check(firstHomes >= 6, $"The first clan's homeworld moves from season to season with four clans ({firstHomes} different systems in 60 seeds)");

        // A new season with three or four clans.
        foreach (var mode in new[] { Modes.Simple, Modes.Advanced })
            foreach (var clans in new[] { 3, 4 })
            {
                var g = New(clans, mode);
                var income = mode == Modes.Advanced ? 18 : 15;
                Check(g.Clans.Count == clans && g.Clans.Select(c => c.Name).Distinct().Count() == clans && g.Clans.All(c => c.Credits == 60 && !c.Ai) &&
                      Enumerable.Range(0, clans).All(t => g.Stars.Count(s => s.Owner == t) == 1 && Home(g, t).Ships[t] == 8 && Home(g, t).Inhabitants == 100 && Rules.Observe(g, t).NextIncome == income &&
                          Rules.Observe(g, t).Stars.Count(s => s.Visible) == 1 && Rules.Observe(g, t).Seats!.Count == clans) &&
                      g.Stars.All(s => s.Ships.Length == clans && s.Scouts.Length == clans && s.Freighters.Length == clans && (s.Fleets?.Length ?? clans) == clans) && !Invalid(g),
                    $"A {mode} season for {clans} clans gives every clan a name, one homeworld, eight ships and the usual opening income, and sees only its own start");
            }

        // Each of four clans plays a turn of its own.
        var four = New(4);
        for (var team = 0; team < 4; team++)
        {
            var home = Home(four, team); var target = four.Stars.First(s => s.Owner is null && Rules.Linked(four, home.Id, s.Id));
            Rules.Submit(four, team, new(four.Turn, 0, Guid.NewGuid().ToString("N"), [new Order("build", home.Id, Ships: 2), new Order("scoutbuild", home.Id, Ships: 1)]), now);
        }
        Turn(four);
        Check(Enumerable.Range(0, 4).All(t => Home(four, t).Ships[t] == 10 && Home(four, t).Scouts[t] == 1 && four.Clans[t].Credits == 60 - 10 - 3 + 15) && four.Turn == 2 && !Invalid(four),
            "All four clans' orders are carried out in the same turn, and each is paid its own income");

        // Battles between more than two clans (generic ships).
        Game Battle(int[] ships, out Star field, Action<Game>? setup = null)
        {
            var g = New(ships.Length); field = Empty(g); setup?.Invoke(g);
            for (var t = 0; t < ships.Length; t++) field.Ships[t] = ships[t];
            Turn(g); return g;
        }
        var three = Battle([8, 3, 3], out var field);
        Check(field.Owner == 0 && field.Ships.SequenceEqual(new[] { 2, 0, 0 }) && three.Clans[0].Reports.Any(r => r.Contains($"Battle at {field.Name}: lost 4 ships")) &&
              three.Clans[1].Reports.Any(r => r.Contains($"Battle at {field.Name}: lost 3 ships")) && three.Clans[2].Reports.Any(r => r.Contains($"Battle at {field.Name}: lost 3 ships")),
            "Eight ships against two clans of three, who also fight each other: the eight lose four, both smaller fleets are destroyed, and two of the survivors found the colony");
        Battle([6, 3, 3], out field);
        Check(field.Owner == 0 && field.Ships.Sum() == 0, "Six ships against two clans of three: the two that survive are just enough to found the colony");
        Battle([5, 4, 1], out field);
        Check(field.Owner is null && field.Ships.Sum() == 0, "Five, four and one: uneven fleets fight round after round until no two hostile clans remain");
        Battle([1, 1, 1], out field);
        Check(field.Ships.Sum() == 1 && field.Owner is null, "One ship each from three clans: two destroy each other and one is left, too few to found a colony");
        Battle([9, 2, 2, 2], out field);
        Check(field.Owner == 0 && field.Ships.SequenceEqual(new[] { 3, 0, 0, 0 }), "Nine ships against three clans of two: five survive, and two of them found the colony");
        var pair = Battle([5, 3, 0], out field);
        Check(field.Owner == 0 && field.Ships.SequenceEqual(new[] { 0, 0, 0 }) && !pair.Clans[2].Reports.Any(r => r.Contains("Battle at")),
            "With only two clans present the battle is the one the game has always fought, and the third clan hears nothing of it");

        // Typed fleets and fixed defenses with three clans.
        var typed = New(3, Modes.Advanced); var site = Empty(typed);
        site.Fleets = [[12, 0, 0, 0, 0], [4, 0, 0, 0, 0], [0, 4, 0, 0, 0]]; TypedCombat.Sync(site);
        Turn(typed);
        var contact = typed.Clans[0].Intelligence.FirstOrDefault(i => i.Mission == "battle" && i.Star == site.Id);
        Check(site.Ships[1] == 0 && site.Ships[2] == 0 && site.Owner == 0 && contact is { EnemyShips: 8 } && contact.EnemyComposition!.SequenceEqual(new[] { 4, 4, 0, 0, 0 }) &&
              typed.Clans[1].Intelligence.Any(i => i.Mission == "battle" && i.Star == site.Id) && !Invalid(typed),
            "With ship types, a fleet facing two clans beats both, founds the colony, and its battle report adds the two hostile fleets together");
        var fort = New(3, Modes.Advanced); var held = Home(fort, 0); held.Defense = 6; held.Fleets![0] = [0, 0, 0, 0, 0]; held.Fleets[1] = [3, 0, 0, 0, 0]; held.Fleets[2] = [3, 0, 0, 0, 0]; TypedCombat.Sync(held);
        Turn(fort);
        Check(held.Owner == 0 && held.Defense is > 0 and < 6 && held.Ships.Sum() == 0, "Fixed defenses hold a colony against small fleets from two clans, and are worn down doing it");

        // Alliances.
        var two = New(2);
        Check(Refused(() => Alliances.Offer(two, 0, 1)) && !Alliances.Available(two) && Rules.Observe(two, 0).Pacts!.Count == 0, "A two-clan season has no alliances");
        var g3 = New(3); int h0 = Home(g3, 0).Id, h1 = Home(g3, 1).Id;
        Check(Refused(() => Alliances.Offer(g3, 0, 0)) && Refused(() => Alliances.Offer(g3, 0, 3)) && Refused(() => Alliances.End(g3, 0, 1)) && Refused(() => Alliances.Decline(g3, 0, 1)),
            "A clan cannot ally with itself or an unknown clan, end an alliance it does not have, or decline an offer nobody made");
        Alliances.Offer(g3, 0, 1);
        Check(Rules.Observe(g3, 0).AllianceOffersMade!.SequenceEqual(new[] { 1 }) && Rules.Observe(g3, 1).AllianceOffersReceived!.SequenceEqual(new[] { 0 }) &&
              Rules.Observe(g3, 2) is { AllianceOffersMade.Count: 0, AllianceOffersReceived.Count: 0 } && !g3.Clans[2].Reports.Any(r => r.Contains("alliance")) &&
              Refused(() => Alliances.Offer(g3, 0, 1)) && g3.Pacts.Count == 0,
            "An offer is shown to the two clans involved and to nobody else, and cannot be made twice");
        Alliances.Decline(g3, 1, 0);
        Check(g3.Clans[0].AllianceOffers.Count == 0 && g3.Clans[0].Reports[0].Contains("declined"), "The other clan can decline, and the clan that offered is told");
        Alliances.Offer(g3, 0, 1); Alliances.Decline(g3, 0, 1);
        Check(g3.Clans[0].AllianceOffers.Count == 0 && g3.Clans[1].Reports[0].Contains("withdrew"), "An offer can be withdrawn before it is answered");
        Alliances.Offer(g3, 0, 1); Alliances.Offer(g3, 1, 0);
        Check(g3.Pacts.Count == 1 && g3.Pacts[0] == new Pact(0, 1, 2) && !Alliances.Allied(g3, 0, 1) && g3.Clans.All(c => c.Reports[0].Contains("are allied from turn 2")) &&
              Rules.Observe(g3, 2).Pacts!.Count == 1 && !Rules.Observe(g3, 0).Stars[h1].Visible && !Invalid(g3) && Copy(g3).Pacts.Count == 1,
            "Accepting makes an alliance that starts with the next turn; every clan is told and can see it");
        Turn(g3);
        var ally = Rules.Observe(g3, 0); var outsider = Rules.Observe(g3, 2);
        Check(Alliances.Allied(g3, 0, 1) && ally.Allies!.SequenceEqual(new[] { 1 }) && ally.Stars[h1] is { Visible: true, Owner: 1, Known: true } && Rules.Observe(g3, 1).Stars[h0].Visible &&
              !outsider.Stars[h0].Visible && !outsider.Stars[h1].Visible && outsider.Allies!.Count == 0 &&
              ally.Stars[h1] is { Stockpile: null, InhabitantGrowth: null, Habitability: null } && ally.Credits == g3.Clans[0].Credits && ally.NextIncome == 15,
            "Allies see what each other sees; credits, income and a colony's private figures stay each clan's own; a third clan sees neither");
        // Allied fleets share a system in peace, even at each other's colonies, while the third clan fights them both.
        var meeting = Empty(g3); meeting.Ships = [4, 4, 4]; g3.Stars[h1].Ships[0] = 5;
        Turn(g3);
        Check(meeting.Ships.SequenceEqual(new[] { 0, 2, 0 }) && meeting.Owner == 0 && g3.Stars[h1].Owner == 1 && g3.Stars[h1].Ships[0] == 5 && g3.Stars[h1].Ships[1] > 0,
            "Allied fleets do not fight each other or take each other's colonies; each fights the third clan separately, and one of them founds the colony they won");
        var scouting = New(3); var seen = Empty(scouting); seen.Ships = [0, 2, 3];
        Intelligence Deep(Game g) { var from = Home(g, 0); from.Scouts[0] = 1; var probe = g.Stars.First(s => s.Id == seen.Id);
            g.Clans[0].Orders = [new Order("recon", from.Id, probe.Id, 1, "deep")]; g.ReconRates = new(100, 100, 100); Recon.Resolve(g, now); return g.Clans[0].Intelligence[0]; }
        var alone = Deep(Copy(scouting)); var friendly = Copy(scouting); friendly.Pacts.Add(new(0, 1, 1));
        Check(alone.EnemyShips == 5 && Deep(friendly).EnemyShips == 3, "A scout's count of other clans' ships adds up every clan that is not an ally");

        // Ending an alliance: a full turn's notice.
        var noticeTurn = g3.Turn;
        Alliances.End(g3, 1, 0);
        Check(g3.Pacts[0].Ends == noticeTurn + 2 && Alliances.Allied(g3, 0, 1, noticeTurn) && Alliances.Allied(g3, 0, 1, noticeTurn + 1) && !Alliances.Allied(g3, 0, 1, noticeTurn + 2) &&
              Refused(() => Alliances.End(g3, 0, 1)) && Refused(() => Alliances.Offer(g3, 0, 1)) && g3.Clans.All(c => c.Reports[0].Contains("gave notice")),
            "Either clan can give notice: the alliance holds for this turn and the next, everyone is told, and it cannot be renewed meanwhile");
        Turn(g3);
        Check(Alliances.Allied(g3, 0, 1) && g3.Stars[h1].Owner == 1 && g3.Stars[h1].Ships[0] == 5, "During the notice turn the allies still do not fight");
        Turn(g3);
        Check(g3.Pacts.Count == 0 && !Alliances.Allied(g3, 0, 1) && g3.Clans.All(c => c.Reports.Any(r => r.Contains("has ended"))) && !Rules.Observe(g3, 1).Stars[h0].Visible, "When the notice runs out the alliance and the shared sight end");
        Turn(g3);
        Check(g3.Stars[h1].Ships[0] == 0 || g3.Stars[h1].Ships[1] == 0, "Former allies in the same system fight on the first turn after the alliance ends");
        var robots = New(3); robots.Clans[1].Ai = true;
        Check(Refused(() => Alliances.Offer(robots, 0, 1)) && Refused(() => Alliances.Offer(robots, 1, 0)), "A clan played by the computer neither offers nor accepts an alliance");

        // Winning.
        Game Leading(int clans, bool allied, int limit = 0)
        {
            var g = New(clans); g.Victory = new VictoryRule(2, 2, limit);
            if (allied) g.Pacts.Add(new(0, 1, 1));
            var colony = Empty(g); colony.Owner = 0; colony.Inhabitants = 20; colony.Collectors = 1;
            return g;
        }
        var solo = Leading(3, false); Turn(solo);
        Check(solo.Winner == 0 && solo.Winners!.SequenceEqual(new[] { 0 }) && Rules.Observe(solo, 2).Winners!.SequenceEqual(new[] { 0 }) && Seasons.Outcome(solo)!.Winners!.SequenceEqual(new[] { 0 }) && !Invalid(solo),
            "A clan that meets the winning condition alone wins alone");
        var shared = Leading(4, true); Turn(shared);
        Check(shared.Winner == 4 && shared.Winners!.SequenceEqual(new[] { 0, 1 }) && Seasons.Record(shared, now).Winners!.SequenceEqual(new[] { 0, 1 }) && Refused(() => Alliances.End(shared, 0, 1)) && !Invalid(shared),
            "When a clan wins, the clan allied with it shares the win, and the season record names both");
        var limited = Leading(3, false, 5); limited.Victory = new VictoryRule(4, 8, 5); limited.Turn = 5; Turn(limited);
        Check(limited.Winners!.SequenceEqual(new[] { 0 }), "At the turn limit the clan with the most colonies wins among three");
        var level = New(3); level.Victory = new VictoryRule(4, 8, 5); level.Turn = 5; Turn(level);
        Check(level.Winner == 3 && level.Winners!.SequenceEqual(new[] { 0, 1, 2 }), "At the turn limit, clans that are exactly level share the season");

        // Changing the number of clans between seasons.
        var growing = New(2); growing.Clans[0].Name = "House Chris"; growing.Clans[0].Messages.Add(new("m1", "Chris", "hello", now));
        Seasons.StartNext(growing, 1, 31, now, endEarly: true, clans: 4);
        Check(growing.Season == 2 && growing.Clans.Count == 4 && growing.Clans[0].Name == "House Chris" && growing.Clans[0].Messages.Count == 1 && growing.Clans[3].Name == Rules.ClanNames[3] &&
              growing.GeneratedMap!.Homeworlds.Count == 4 && growing.History.Count == 1 && growing.History[0].Standings.Length == 2 && !Invalid(growing),
            "The next season can have more clans: existing clans keep their names and channels, and the finished season keeps its own standings");
        growing.Pacts.Add(new(2, 3, 1));
        Seasons.StartNext(growing, 2, 32, now, endEarly: true, clans: 3);
        Check(growing.Clans.Count == 3 && growing.Pacts.Count == 0 && growing.Stars.All(s => s.Ships.Length == 3) && !Invalid(growing), "The next season can have fewer clans, and alliances do not carry over");
        Seasons.StartNext(growing, 3, 33, now, endEarly: true);
        Check(growing.Clans.Count == 3 && growing.Season == 4, "With no choice made, the next season keeps the same number of clans");
        Seasons.SetMode(growing, 4, Modes.Advanced, now, clans: 4);
        Check(growing.Clans.Count == 4 && growing.Mode == Modes.Advanced && growing.Season == 4, "Before a season's first turn the game creator can still change the number of clans");
        var legacy = Rules.CreateFromMap(RealStarMap.Generate(), now, false);
        Check(Refused(() => Seasons.StartNext(legacy, 1, 31, now, endEarly: true, clans: 3)) && Refused(() => Seasons.StartNext(growing, 4, 34, now, endEarly: true, clans: 5)) && legacy.Season == 1,
            "Three or four clans need simple or advanced mode, and five are refused");

        // Saves.
        var forgedPact = New(2); forgedPact.Pacts.Add(new(0, 1, 1));
        var badPact = New(3); badPact.Pacts.Add(new(1, 1, 1));
        var twice = New(3); twice.Pacts.Add(new(0, 1, 1)); twice.Pacts.Add(new(0, 1, 2));
        var shortArray = New(3); shortArray.Stars[0].Ships = [0, 0];
        var stranger = New(3); stranger.Stars[0].Owner = 3;
        var crowd = New(4); crowd.Clans.Add(new() { Name = "Fifth" });
        Check(Invalid(forgedPact) && Invalid(badPact) && Invalid(twice) && Invalid(shortArray) && Invalid(stranger) && Invalid(crowd),
            "A save with an impossible alliance, a fleet list of the wrong length, an unknown owner or a fifth clan is rejected");

        // The computer plays whole seasons with three and four clans.
        foreach (var mode in new[] { Modes.Simple, Modes.Advanced })
            foreach (var clans in new[] { 3, 4 })
            {
                var slowest = 0; var finished = 0; var valid = true; const int maps = 6;
                for (var seed = 1; seed <= maps; seed++)
                {
                    var g = Modes.Create(RealStarMap.Generate(seed, clans), now, true, mode);
                    foreach (var clan in g.Clans) clan.Ai = true;
                    g.ReconEntropy = Convert.ToHexString(Enumerable.Repeat((byte)(seed + 1), 32).ToArray());
                    for (var turn = 0; turn < 120 && g.Winner is null; turn++) Turn(g);
                    if (g.Winner is not null) { finished++; slowest = Math.Max(slowest, Seasons.TurnsPlayed(g)); }
                    valid &= !Invalid(g);
                }
                Console.WriteLine($"INFO {mode}, {clans} clans: {finished} of {maps} seasons finished, slowest {slowest} turns");
                Check(finished == maps && valid, $"Computer-played clans finish a {mode} season with {clans} clans on every test map and leave a valid save");
            }

        Console.WriteLine($"{count} clan and alliance checks passed.");
    }
}
