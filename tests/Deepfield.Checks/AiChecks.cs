using System.Text.Json;
using Deepfield.Api;
using Deepfield.Engine;

public static class AiChecks
{
    static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-11-26T12:00:00Z");

    // Fixed private entropy makes material deposits and scout outcomes repeatable, so these games play the same every run.
    static Game Fresh(int seed, string mode, bool firstComputer = false, bool secondComputer = false)
    {
        var game = Modes.Create(RealStarMap.Generate(seed), Now, secondComputer, mode);
        game.ReconEntropy = Convert.ToHexString(Enumerable.Repeat((byte)(seed + 1), 32).ToArray());
        game.Clans[0].Ai = firstComputer;
        return game;
    }

    public static void Run()
    {
        var count = 0;
        void Check(bool ok, string label) { if (!ok) throw new Exception(label); count++; Console.WriteLine("PASS " + label); }
        bool Refused(Action action) { try { action(); return false; } catch (RuleException) { return true; } }
        bool Invalid(Game game) { try { GameCodec.Read(JsonSerializer.Serialize(game)); return false; } catch (InvalidOperationException) { return true; } }
        Star Home(Game g, int team) => g.Stars.First(s => s.Owner == team);
        int[] Neighbours(Game g, int star) => g.Stars.Where(s => Rules.Linked(g, star, s.Id)).Select(s => s.Id).ToArray();
        Submission Orders(Game g, params Order[] orders) => new(g.Turn, 0, Guid.NewGuid().ToString("N"), [.. orders]);

        // The computer plays whole seasons in both modes without stalling or breaking a rule.
        foreach (var mode in new[] { Modes.Simple, Modes.Advanced })
        {
            var slowest = 0; var most = 0;
            for (var seed = 1; seed <= 12; seed++)
            {
                var game = Fresh(seed, mode, true, true);
                while (game.Winner is null && game.Turn <= 40)
                {
                    for (var team = 0; team < 2; team++)
                    {
                        var view = Rules.Observe(game, team); var plan = Rules.PlanAi(view);
                        Rules.Validate(view, plan); // Throws if the computer planned something a person could not order.
                        most = Math.Max(most, plan.Count);
                    }
                    Rules.Resolve(game, game.Deadline);
                }
                if (game.Winner is null || Invalid(game)) throw new Exception($"The computer stalled or left an invalid save in {mode} mode on map {seed}.");
                slowest = Math.Max(slowest, game.Turn - 1);
            }
            Console.WriteLine($"INFO {mode}: 12 maps, slowest season {slowest} turns, largest plan {most} orders");
            Check(slowest <= 40 && most <= 24, $"Two computer-played clans finish a {mode}-mode season on each of 12 maps, with every plan passing the rules people are held to");
        }

        // Planning behaviour.
        var poor = Fresh(3, Modes.Simple); var home = Home(poor, 0);
        home.Ships[0] = 2; poor.Clans[0].Credits = 30;
        var plan0 = Rules.PlanAi(Rules.Observe(poor, 0));
        Check(plan0.Any(o => o.Kind == "build" && o.Ships == 2) && plan0.All(o => o.Kind != "collector") && plan0.All(o => o.Kind != "move"),
            "A frontier colony short of ships builds its expedition before buying collectors, and waits until it is ready");
        var done = Fresh(3, Modes.Simple); Home(done, 0).Collectors = Rules.Victory(done).Collectors; done.Clans[0].Credits = 200;
        Check(Rules.PlanAi(Rules.Observe(done, 0)).All(o => o.Kind != "collector"), "The computer stops buying collectors once it has enough to win in simple mode");
        var paying = Fresh(3, Modes.Advanced); Home(paying, 0).Collectors = 8; paying.Clans[0].Credits = 200; Home(paying, 0).Collectors = 2; paying.Victory = new(4, 2, 0);
        Check(Rules.PlanAi(Rules.Observe(paying, 0)).Any(o => o.Kind == "collector"), "In advanced mode it still buys a colony's first three collectors, because they add income");

        var wary = Fresh(3, Modes.Simple); var wHome = Home(wary, 0); var around = Neighbours(wary, wHome.Id).OrderBy(id => id).ToArray();
        var usual = Rules.PlanAi(Rules.Observe(wary, 0)).First(o => o.Kind == "move").Target;
        wary.Clans[0].Intelligence.Insert(0, new("sighting", usual, wary.Turn, Now, "test", "battle", false, true, false, null, null, 6, null, null));
        var cautious = Rules.PlanAi(Rules.Observe(wary, 0));
        Check(around.Length > 1 && usual == around[0] && cautious.First(o => o.Kind == "move").Target != usual,
            "After meeting the other clan at a system the computer tries a different neighbour first");
        foreach (var id in around.Where(id => id != usual)) wary.Stars[id].Owner = 0;
        wary.Clans[0].Credits = 500; // Enough that the new colonies' own purchases do not decide what home can afford.
        var gathering = Rules.PlanAi(Rules.Observe(wary, 0));
        Check(gathering.Where(o => o.Source == wHome.Id).All(o => o.Kind != "move" || o.Target != usual) && gathering.Any(o => o.Source == wHome.Id && o.Kind == "build"),
            "With only a defended system left to attack, it gathers a larger force instead of sending eight ships against six");

        var interior = Fresh(3, Modes.Simple); var iHome = Home(interior, 0);
        foreach (var id in Neighbours(interior, iHome.Id)) interior.Stars[id].Owner = 0;
        interior.Clans[0].Known = interior.Stars.Select(s => s.Id).ToList();
        var relay = Rules.PlanAi(Rules.Observe(interior, 0)).Where(o => o.Source == iHome.Id && o.Kind == "move").ToList();
        Check(relay.Count == 1 && interior.Stars[relay[0].Target].Owner == 0 && relay[0].Ships == iHome.Ships[0] - 1,
            "A colony with no frontier of its own forwards its ships to a neighbouring colony that has one");

        var legacy = Rules.CreateFromMap(RealStarMap.Generate(3), Now, true);
        Check(legacy.Mode is null && Rules.PlanAi(Rules.Observe(legacy, 1))[0].Kind == "scoutbuild" && Rules.PlanAi(Rules.Observe(Fresh(3, Modes.Simple), 1))[0].Kind == "move",
            "A campaign from before modes keeps the original computer player");

        // The computer plays a clan only when the campaign owner says so.
        var game2 = Fresh(5, Modes.Simple);
        Check(Rules.Observe(game2, 0).Seats is [{ Name: "Aurora Federation", Computer: false }, { Name: "Ember Empire", Computer: false }], "Both clans see who plays each clan");
        var before = (game2.Stars.Sum(s => s.Ships[1]), game2.Stars.Count(s => s.Owner == 1), game2.Clans[1].Credits);
        Rules.Resolve(game2, game2.Deadline);
        Check((game2.Stars.Sum(s => s.Ships[1]), game2.Stars.Count(s => s.Owner == 1), game2.Clans[1].Credits) == (before.Item1, before.Item2, before.Credits + 15) && game2.Clans[1].Reports.Any(r => r.Contains("0 orders executed")),
            "A clan of players that misses a turn gives no orders: the computer does not step in by itself");
        var ember = Home(game2, 1);
        Rules.Submit(game2, 1, Orders(game2, new Order("build", ember.Id, Ships: 1)), Now);
        Ai.SetControl(game2, 1, true);
        Check(game2.Clans[1].Ai && game2.Clans[1].Orders.Count == 1 && game2.Clans.All(c => c.Reports[0] == "Ember Empire is now played by the computer, as set by the campaign owner.") && Rules.Observe(game2, 0).Seats![1].Computer,
            "The owner can hand a clan to the computer; both clans are told, and the players' submitted orders are kept");
        var reports = game2.Clans[0].Reports.Count; Ai.SetControl(game2, 1, true);
        Check(game2.Clans[0].Reports.Count == reports && Refused(() => Ai.SetControl(game2, 2, true)) && Refused(() => Ai.SetControl(game2, -1, false)), "Repeating the same setting changes nothing, and an unknown clan is refused");
        var handedBack = GameCodec.Read(JsonSerializer.Serialize(game2)); var emberShips = ember.Ships[1];
        Rules.Resolve(game2, game2.Deadline);
        Check(game2.Clans[1].Reports.Any(r => r.StartsWith($"Turn {game2.Turn - 1}:") && !r.Contains(" 1 orders")) && game2.Stars[ember.Id].Collectors == 2,
            "While a clan is set to the computer, the computer's plan is used at the turn resolution");
        Ai.SetControl(handedBack, 1, false); Rules.Resolve(handedBack, handedBack.Deadline);
        Check(!handedBack.Clans[1].Ai && handedBack.Clans[1].Reports.Any(r => r.Contains("is played by its players again")) && handedBack.Stars[ember.Id].Collectors == 1 && handedBack.Stars[ember.Id].Ships[1] == emberShips + 1 && handedBack.Clans[1].Reports.Any(r => r.Contains(" 1 orders executed")),
            "Handed back before the turn resolves, the clan's own submitted orders are the ones carried out");
        Seasons.StartNext(game2, game2.Season, 77, Now, endEarly: true);
        Check(game2.Clans[1].Ai && !game2.Clans[0].Ai && game2.Season == 2, "The setting carries into the next season");
        Console.WriteLine($"{count} computer-player checks passed.");
    }
}
