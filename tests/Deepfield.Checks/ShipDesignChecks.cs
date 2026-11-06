using System.Text.Json;
using System.Text.Json.Nodes;
using Deepfield.Engine;
using Deepfield.Engine.Combat;

public static class ShipDesignChecks
{
    public static void Run()
    {
        var now = DateTimeOffset.Parse("2026-10-15T12:00:00Z");
        var checks = 0;
        void Check(bool condition, string label)
        {
            if (!condition) throw new Exception(label);
            checks++;
            Console.WriteLine("PASS " + label);
        }
        void Reject(Action action, string label)
        {
            try { action(); }
            catch (RuleException) { Check(true, label); return; }
            throw new Exception("Expected rejection: " + label);
        }
        Game New() => Rules.Create(42, now, false, 1, 1,
            reconEntropy: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");

        var game = New();
        Check(game.Clans[0].ShipDesigns.SequenceEqual(ShipDesign.Defaults()), "New typed fleets start with five standard packages");
        var refit = new Order("refit", 0, Hull: "torpedo", Package: "assault");
        Rules.Validate(Rules.Observe(game, 0), [refit]);
        Reject(() => Rules.Validate(Rules.Observe(game, 0), [refit, refit]), "One package change per hull per turn");
        Reject(() => Rules.Validate(Rules.Observe(game, 0), [refit with { Package = "unknown" }]), "Unknown package rejected");
        Reject(() => Rules.Validate(Rules.Observe(game, 0), [refit with { Package = "standard" }]), "No-op package change rejected");
        Rules.Validate(Rules.Observe(game, 0), [refit with { Package = "assault-reinforced" }]);
        Check(ShipDesign.MaterialCost("assault-reinforced").SequenceEqual([2, 1, 2, 1, 0, 0]),
            "Combined package requires both material sets");
        Reject(() => Rules.Validate(Rules.Observe(game, 0), [new("build", 0, Ships: 1, Package: "assault")]), "Package cannot attach to construction order");
        Reject(() => Rules.Validate(Rules.Observe(Rules.Create(42, now, false), 0), [refit]), "Classic fleet cannot adopt a typed package");

        game.Clans[1].ShipDesigns[2] = "reinforced";
        var ownView = Rules.Observe(game, 0);
        Check(ownView.ShipDesigns![2] == "standard" && !JsonSerializer.Serialize(ownView).Contains("reinforced"),
            "Enemy ship packages stay private");
        var initialCredits = game.Clans[0].Credits;
        var expectedIncome = ownView.NextIncome;
        Rules.Submit(game, 0, new(1, 0, "ship-design", [refit]), now);
        var before = GameCodec.Read(JsonSerializer.Serialize(game));
        Rules.Resolve(game, game.Deadline);
        Rules.Resolve(before, before.Deadline);
        Check(JsonSerializer.Serialize(game) == JsonSerializer.Serialize(before), "Package adoption replays deterministically");
        Check(game.Clans[0].ShipDesigns[1] == "assault" && game.Clans[0].Credits == initialCredits - ShipDesign.AdoptionCredits + expectedIncome,
            "Package adoption charges credits and applies after the turn");
        Check(Rules.Observe(game, 0).ShipDesigns![1] == "assault", "Active package appears in clan view");

        Fleet left = new([1, 4, 0, 0, 0]);
        Fleet right = new([0, 0, 7, 0, 0]);
        var standard = CounterBattle.Resolve(left, right);
        var assault = CounterBattle.Resolve(left, right, [0, 1, 0, 0, 0], [0, 0, 0, 0, 0]);
        Check(standard.Left.Value == 0 && standard.Right.Value > 0 && assault.Left.Value > 0 && assault.Right.Value == 0,
            "Assault package changes a close counter battle outcome");
        var shielded = CounterBattle.Resolve(new Fleet([8, 0, 0, 0, 0]), new Fleet([8, 0, 0, 0, 0]),
            [2, 0, 0, 0, 0], [0, 0, 0, 0, 0]);
        Check(shielded.Left.Counts[0] == 2 && shielded.Right.Value == 0,
            "Reinforced package absorbs one loss per four ships");
        var combinedAttack = CounterBattle.Resolve(left, right, [0, 3, 0, 0, 0], [0, 0, 0, 0, 0]);
        var combinedArmor = CounterBattle.Resolve(new Fleet([8, 0, 0, 0, 0]), new Fleet([8, 0, 0, 0, 0]),
            [3, 0, 0, 0, 0], [0, 0, 0, 0, 0]);
        Check(combinedAttack.Left.Value > 0 && combinedAttack.Right.Value == 0 &&
              combinedArmor.Left.Counts[0] >= shielded.Left.Counts[0] && combinedArmor.Right.Value == 0,
            "Combined package applies assault shots and reinforced loss absorption");
        var battle = New();
        battle.Clans[0].ShipDesigns[1] = "assault";
        battle.Stars[1].Fleets! [0] = [1, 4, 0, 0, 0];
        battle.Stars[1].Fleets! [1] = [0, 0, 7, 0, 0];
        TypedCombat.Sync(battle.Stars[1]);
        TypedCombat.Resolve(battle, battle.Stars[1], now);
        Check(battle.Stars[1].Ships[0] == 4 && battle.Stars[1].Ships[1] == 0,
            "Campaign combat uses the saved clan ship package");

        var map = RealStarMap.Generate();
        var real = Rules.CreateFromMap(map, now, false, combatVersion: 1);
        var home = map.Homeworlds[0].SystemId;
        real.Clans[0].Materials![2] = 1;
        Reject(() => Rules.Validate(Rules.Observe(real, 0), [refit with { Source = home }]),
            "Real campaign requires package materials at commit");
        real.Clans[0].Materials![2] = 2;
        Rules.Submit(real, 0, new(1, 0, "material-refit", [refit with { Source = home }]), now);
        Check(real.Clans[0].Orders.Single().Package == "assault", "Adequate package materials permit the order");

        var oldSave = JsonNode.Parse(JsonSerializer.Serialize(New()))!;
        foreach (var clan in oldSave["Clans"]!.AsArray()) clan!.AsObject().Remove("ShipDesigns");
        var loaded = GameCodec.Read(oldSave.ToJsonString());
        Check(loaded.Clans.All(clan => clan.ShipDesigns.SequenceEqual(ShipDesign.Defaults())),
            "Existing saves without package fields keep standard fleets");
        Check(!JsonSerializer.Serialize(new Order("build", 0, Ships: 1)).Contains("Package"),
            "Old order payloads omit the new optional package field");
        Console.WriteLine($"{checks} ship design checks passed.");
    }
}
