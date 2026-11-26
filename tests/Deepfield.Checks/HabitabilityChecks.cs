using System.Text.Json;
using Deepfield.Engine;

public static class HabitabilityChecks
{
    public static void Run()
    {
        var now = DateTimeOffset.Parse("2026-11-18T12:00:00Z");
        var map = RealStarMap.Generate();
        var seedA = new string('A', 64);
        var seedB = new string('B', 64);
        Game Fresh(string entropy) => Rules.CreateFromMap(map, now, ai:false, reconEntropy:entropy);
        void Check(bool pass, string label)
        {
            if (!pass) throw new InvalidOperationException(label);
            Console.WriteLine("PASS " + label);
        }

        var a = Fresh(seedA);
        var replay = Fresh(seedA);
        var b = Fresh(seedB);
        Check(a.Stars.Select(s => s.Environment).SequenceEqual(replay.Stars.Select(s => s.Environment)),
            "Same campaign entropy reproduces the same profiles");
        Check(a.Stars.Select(s => s.Environment).SequenceEqual(GameCodec.Read(JsonSerializer.Serialize(a)).Stars.Select(s => s.Environment)),
            "A saved campaign retains profiles exactly");
        Check(map.Homeworlds.All(home =>
                Habitability.Score(a.Stars[home.SystemId].Environment!) >= 70 &&
                Habitability.Score(b.Stars[home.SystemId].Environment!) >= 70 &&
                a.Stars[home.SystemId].Environment != b.Stars[home.SystemId].Environment &&
                Habitability.Score(a.Stars[home.SystemId].Environment!) != Habitability.Score(b.Stars[home.SystemId].Environment!)),
            "Both homes are favored, but the same map with new entropy can have different home profiles and scores");
        var homes = map.Homeworlds.Select(home => home.SystemId).ToHashSet();
        Check(a.Stars.Any(star => !homes.Contains(star.Id) && Habitability.Score(star.Environment!) >= 60) &&
              a.Stars.Any(star => !homes.Contains(star.Id) && Habitability.Score(star.Environment!) < 70),
            "Other worlds use the full range; desirable and difficult destinations can coexist");

        var source = map.Homeworlds.Single(home => home.PlayerSlot == 0).SystemId;
        var target = a.Stars.First(star => Rules.Linked(a, source, star.Id) && star.Owner is null).Id;
        var targetEnvironment = a.Stars[target].Environment!;
        var pre = Rules.Observe(a, 0);
        Check(!JsonSerializer.Serialize(pre).Contains("ThermalStress") && pre.Intelligence!.Count == 0,
            "Fresh campaign does not expose environments before a survey");
        // Control return odds only within this disposable fixture; production rates stay unchanged.
        a.ReconRates = new(100, 65, 100);
        Rules.Submit(a, 0, new(1, 0, "build-test-scout", [new("scoutbuild", source, Ships:1)]), now);
        Check(Rules.Resolve(a, a.Deadline) && a.Stars[source].Scouts[0] == 1,
            "Fresh campaign builds a scout through a normal submitted turn");
        Rules.Submit(a, 0, new(a.Turn, a.Clans[0].Revision, "survey-test", [new("recon", source, target, 1, "deep")]), a.Deadline.AddMinutes(-1));
        Check(Rules.Resolve(a, a.Deadline), "Deep scout resolves through a normal following turn");
        var view = Rules.Observe(a, 0);
        var report = view.Intelligence!.Single(intel => intel.Star == target);
        Check(report.Returned && report.Turn == view.Turn - 1 &&
              report.HabitabilityScore == Habitability.Score(targetEnvironment) &&
              report.HabitabilityFactors == new HabitabilityFactors(targetEnvironment.ThermalStress,targetEnvironment.GravityStress,targetEnvironment.RadiationStress),
            "Successful Deep report carries the correct dated score and all contributors");
        Check(Rules.Observe(a, 1).Intelligence!.All(report => report.HabitabilityFactors is null) && a.Stars[target].Owner is null,
            "Survey is clan-private and does not settle the destination");
        var draft = new List<Order> { new("move", source, target, 2) };
        Rules.Validate(view, draft);
        Check(view.Orders.Count == 0 && a.Clans[0].Orders.Count == 0 && a.Stars[target].Environment == targetEnvironment,
            "The surveyed destination can be drafted without committing an expedition or updating the environment");
        Rules.Submit(a, 0, new(a.Turn, a.Clans[0].Revision, "settle-test", draft), a.Deadline.AddMinutes(-1));
        Check(Rules.Resolve(a, a.Deadline) && a.Stars[target].Owner == 0 && a.Stars[target].Environment == targetEnvironment,
            "Colonizing later does not apply the starting homeworld bonus");
    }
}
