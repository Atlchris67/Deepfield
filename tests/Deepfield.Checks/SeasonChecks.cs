using System.Text.Json;
using System.Text.Json.Nodes;
using Deepfield.Api;
using Deepfield.Engine;

public static class SeasonChecks
{
    public static async Task Run()
    {
        var count = 0; var now = DateTimeOffset.Parse("2026-11-26T12:00:00Z");
        void Check(bool ok, string label) { if (!ok) throw new Exception(label); count++; Console.WriteLine("PASS " + label); }
        bool Refused(Action action) { try { action(); return false; } catch (RuleException) { return true; } }
        string Json(object? value) => JsonSerializer.Serialize(value);
        (int, int)[] Links(GeneratedStarMap map) => map.Links.Select(l => (l.From, l.To)).ToArray();

        // Varied maps.
        var classic = RealStarMap.Generate();
        Check(Json(classic) == Json(RealStarMap.Generate(0)) && classic.Seed == 0 && classic.Homeworlds[0].SystemId == 0 && classic.Homeworlds[1].SystemId == 23 &&
              string.Join(" ", classic.Links.Select(l => $"{l.From}-{l.To}")) == "0-1 0-3 0-6 1-10 1-11 1-18 2-6 2-8 2-12 2-21 3-16 3-23 4-5 4-11 5-7 5-8 7-9 7-19 8-12 9-14 9-17 9-19 10-13 10-18 10-22 12-21 13-22 14-15 14-17 14-20 15-16 16-23 19-20",
            "Map seed 0 is still the original fixed layout that existing saves were created from");
        const int seeds = 300;
        var maps = Enumerable.Range(1, seeds).Select(seed => RealStarMap.Generate(seed)).ToArray();
        Check(maps.Select((map, i) => Json(map) == Json(RealStarMap.Generate(i + 1)) && map.Seed == i + 1).All(same => same), "A map seed always produces the same map");
        Check(maps.All(map => RealStarMap.Hops(map.Systems.Count, Links(map), 0).All(h => h != int.MaxValue)), "Every seeded map is fully connected");
        Check(maps.All(map => Json(map.Systems) == Json(classic.Systems) && Json(map.RealSystems) == Json(classic.RealSystems)), "Seeded maps keep the same real stars and catalog data");
        Check(maps.All(map => map.Homeworlds.Count == 2 && map.Homeworlds[0].SystemId != map.Homeworlds[1].SystemId && map.Homeworlds[0].PlayerSlot == 0 && map.Homeworlds[1].PlayerSlot == 1 &&
            map.Homeworlds.All(h => map.RealSystems![h.SystemId].Planets.Any(p => p.Id == h.PlanetId))), "Every seeded map gives each clan its own homeworld on a cataloged planet");
        var fairness = maps.Select(map =>
        {
            var a = RealStarMap.Hops(map.Systems.Count, Links(map), map.Homeworlds[0].SystemId); var b = RealStarMap.Hops(map.Systems.Count, Links(map), map.Homeworlds[1].SystemId);
            return (Separation: a[map.Homeworlds[1].SystemId], Imbalance: RealStarMap.Imbalance(a, b),
                Neighbours: Math.Abs(a.Count(h => h == 1) - b.Count(h => h == 1)), Territory: Math.Abs(Enumerable.Range(0, a.Length).Count(i => a[i] < b[i]) - Enumerable.Range(0, a.Length).Count(i => b[i] < a[i])));
        }).ToArray();
        Console.WriteLine($"INFO seeded maps: separation {fairness.Min(f => f.Separation)}-{fairness.Max(f => f.Separation)} hops, worst imbalance {fairness.Max(f => f.Imbalance)}, worst neighbour gap {fairness.Max(f => f.Neighbours)}, worst territory gap {fairness.Max(f => f.Territory)}");
        Check(fairness.All(f => f.Separation >= 3), "Homeworlds are always at least three jumps apart");
        Check(fairness.All(f => f.Neighbours <= 1 && f.Territory <= 4 && f.Imbalance <= 4), "Homeworlds are evenly matched: neighbouring systems differ by at most one and nearer territory by at most four of 24 systems");
        var homePairs = maps.Select(map => (map.Homeworlds[0].SystemId, map.Homeworlds[1].SystemId)).Distinct().Count();
        var linkSets = maps.Select(map => Json(map.Links)).Distinct().Count();
        var homeSystems = maps.SelectMany(map => map.Homeworlds.Select(h => h.SystemId)).Distinct().Count();
        Console.WriteLine($"INFO seeded maps: {homePairs} distinct homeworld pairs, {homeSystems} distinct homeworld systems, {linkSets} distinct link layouts in {seeds} seeds");
        Check(homePairs >= 40 && homeSystems >= 12 && linkSets >= seeds * 9 / 10, "Homeworlds and links vary widely from seed to seed");
        Check(maps.Any(map => map.Homeworlds[0].SystemId < map.Homeworlds[1].SystemId) && maps.Any(map => map.Homeworlds[0].SystemId > map.Homeworlds[1].SystemId), "Either clan can receive either end of a homeworld pair");
        var seeded = maps[6];
        var swapped = seeded with { Homeworlds = [seeded.Homeworlds[0] with { SystemId = seeded.Homeworlds[1].SystemId }, seeded.Homeworlds[1] with { SystemId = seeded.Homeworlds[0].SystemId }] };
        Check(Rules.CreateFromMap(seeded, now).GeneratedMap!.Seed == 7 && Refused(() => Rules.CreateFromMap(swapped, now)) && Refused(() => Rules.CreateFromMap(seeded with { Seed = 8 }, now)),
            "A campaign accepts a seeded map only if it matches what that seed generates");

        // Victory.
        Game Fresh(int seed = 5) => Rules.CreateFromMap(RealStarMap.Generate(seed), now, false, economyVersion: 1, combatVersion: 1, logisticsVersion: 0, industrialFocus: [1, -1]);
        void Win(Game g, params int[] teams)
        {
            foreach (var team in teams)
                foreach (var star in g.Stars.Where(s => s.Owner is null).Take(3)) { star.Owner = team; star.Collectors = 3; }
            if (!Rules.Resolve(g, g.Deadline)) throw new Exception("Turn did not resolve.");
        }
        var game = Fresh();
        Check(game.Season == 1 && game.History.Count == 0 && game.Started == now && game.Ended is null && Rules.Observe(game, 0) is { Season: 1, Outcome: null, History.Count: 0 },
            "A new campaign is season 1 with no result and no history");
        game.Clans[0].Messages.Add(new("m1", "Sam", "See you next season", now)); game.Clans[1].Ai = true;
        var ended = game.Deadline; Win(game, 0);
        var loserView = Rules.Observe(game, 1);
        Check(game.Winner == 0 && game.Ended == ended && loserView.Outcome is { Winner: 0, Turns: 1 } outcome && outcome.Ended == ended &&
              outcome.Standings is [{ Name: "Aurora Federation", Colonies: 4, Collectors: 10 }, { Name: "Ember Empire", Colonies: < 4 }] && outcome.Standings.All(s => s.Ships > 0),
            "When a clan wins, both clans see the final standings of both");
        Check(!Rules.Resolve(game, game.Deadline.AddDays(3)) && game.Turn == 2, "A decided season resolves no further turns");

        // Next season.
        Check(Refused(() => Seasons.StartNext(game, 2, 9, now)) && Refused(() => Seasons.StartNext(game, 0, 9, now)) && game.Season == 1 && game.Winner == 0, "Starting the next season must name the current season");
        var oldMap = Json(game.GeneratedMap!); var later = now.AddDays(20);
        Seasons.StartNext(game, 1, 9, later);
        Check(game.Season == 2 && game.Winner is null && game.Ended is null && game.Started == later && game.Turn == 1 && game.Deadline == later.AddDays(1) && game.GeneratedMap!.Seed == 9 && Json(game.GeneratedMap) != oldMap,
            "The next season starts at turn 1 on a different map");
        Check(game.History is [{ Season: 1, Winner: 0, Turns: 1, MapSeed: 5 } record] && record.Started == now && record.Ended == ended && Json(record.Standings) == Json(loserView.Outcome!.Standings),
            "The finished season is kept in the history with its winner, length and standings");
        Check(game.Clans.Select(c => c.Name).SequenceEqual(["Aurora Federation", "Ember Empire"]) && !game.Clans[0].Ai && game.Clans[1].Ai && game.Clans[0].Messages is [{ Text: "See you next season" }] &&
              game.Clans.All(c => c.Credits == 60 && c.Orders.Count == 0 && c.Intelligence.Count == 0 && c.Reports[0].StartsWith("Season 2 begins")),
            "Clans, AI seats and clan channels carry over; treasury, orders and intelligence start fresh");
        Check(game.EconomyVersion == 1 && game.CombatVersion == 1 && game.LogisticsVersion == 0 && game.MaterialsVersion == 1 && game.Clans[0].IndustrialFocus == 1 && game.Clans[1].IndustrialFocus == -1 &&
              game.Stars.Count(s => s.Owner is not null) == 2 && game.Stars.Where(s => s.Owner is not null).All(s => s.Fleets is not null && s.Collectors == 1),
            "The next season keeps the campaign's rule choices and gives each clan one fresh homeworld");
        Check(Refused(() => Seasons.StartNext(game, 1, 11, later)) && game.Season == 2 && game.GeneratedMap!.Seed == 9, "A repeated start request cannot skip a season");
        Check(Rules.Observe(game, 1) is { Season: 2, Outcome: null, History: [{ Winner: 0 }] }, "Both clans see the season number and past results");
        Check(Refused(() => Seasons.StartNext(game, 2, 12, later)) && game.Season == 2, "A season without a winner is not replaced unless ending it early is confirmed");
        Seasons.StartNext(game, 2, 12, later.AddDays(2), endEarly: true);
        Check(game.Season == 3 && game.History is [_, { Season: 2, Winner: null, Turns: 0 } early] && early.Ended == later.AddDays(2), "A season ended early is recorded without a winner");
        Win(game, 0, 1);
        Check(game.Winner == 2 && Rules.Observe(game, 0).Outcome is { Winner: 2 }, "A simultaneous finish is a shared victory");
        Seasons.StartNext(game, 3, 13, later.AddDays(9));
        Check(game.History is [_, _, { Season: 3, Winner: 2 }], "A shared victory is recorded in the history");
        for (var i = 0; i < Seasons.MaximumHistory + 5; i++) Seasons.StartNext(game, game.Season, 20 + i, later, endEarly: true);
        Check(game.History.Count == Seasons.MaximumHistory && game.History[^1].Season == game.Season - 1, "History keeps the most recent fifty seasons");

        // Winning condition chosen by the game creator.
        var custom = Fresh(15);
        Check(Rules.Observe(custom, 0) is { Goal: 8, Victory: { Colonies: 4, Collectors: 8, TurnLimit: 0 } } && custom.Victory is null, "A campaign without a chosen winning condition uses 4 colonies and 8 collectors with no turn limit");
        Check(Refused(() => Seasons.SetVictory(custom, 1, new(1, 8))) && Refused(() => Seasons.SetVictory(custom, 1, new(13, 20))) && Refused(() => Seasons.SetVictory(custom, 1, new(4, 3))) && Refused(() => Seasons.SetVictory(custom, 1, new(4, 61))) &&
              Refused(() => Seasons.SetVictory(custom, 1, new(4, 8, 4))) && Refused(() => Seasons.SetVictory(custom, 1, new(4, 8, 366))) && Refused(() => Seasons.SetVictory(custom, 2, new(3, 6))) && custom.Victory is null,
            "An out-of-range winning condition, or one for another season, is refused");
        Seasons.SetVictory(custom, 1, new(3, 6, 5));
        Check(Rules.Observe(custom, 1) is { Goal: 6, Victory: { Colonies: 3, Collectors: 6, TurnLimit: 5 } } && custom.Clans.All(c => c.Reports[0].Contains("3 colonies and 6 collectors")), "The game creator can set the winning condition before the first turn, and both clans are told");
        foreach (var star in custom.Stars.Where(s => s.Owner is null).Take(2)) { star.Owner = 1; star.Collectors = 3; }
        Rules.Resolve(custom, custom.Deadline);
        Check(custom.Winner == 1 && custom.Clans[1].Reports.Any(r => r.Contains("/6 energy collectors")), "A lowered winning condition decides the season at the lower threshold");
        var limited = Fresh(16); Seasons.SetVictory(limited, 1, new(12, 60, 5));
        limited.Stars.First(s => s.Owner is null).Owner = 0;
        for (var i = 0; i < 4; i++) Rules.Resolve(limited, limited.Deadline);
        Check(limited.Turn == 5 && limited.Winner is null && Refused(() => Seasons.SetVictory(limited, 1, new(4, 8))), "A turn limit does not end the season early, and the winning condition is fixed once turns have resolved");
        var ahead = limited.Stars.Count(s => s.Owner == 0) - limited.Stars.Count(s => s.Owner == 1);
        Rules.Resolve(limited, limited.Deadline);
        Check(limited.Winner == (ahead > 0 ? 0 : ahead < 0 ? 1 : limited.Winner) && limited.Winner is not null && limited.Ended is not null && limited.Clans[0].Reports.Any(r => r.Contains("5-turn limit")),
            "At the turn limit an undecided season goes to the clan with more colonies");
        var level = Fresh(17); level.Clans[0].Ai = level.Clans[1].Ai = false; Seasons.SetVictory(level, 1, new(12, 60, 5));
        for (var i = 0; i < 5; i++) Rules.Resolve(level, level.Deadline);
        Check(level.Winner == 2, "Equal clans at the turn limit share the victory");
        Seasons.StartNext(limited, 1, 18, later);
        Check(limited.Victory == new VictoryRule(12, 60, 5) && limited.Clans[0].Reports[0].Contains("12 colonies and 60 collectors"), "The next season keeps the winning condition unless a new one is given");
        Check(Refused(() => Seasons.StartNext(limited, 2, 19, later, endEarly: true, victory: new(1, 1))) && limited.Season == 2, "An invalid winning condition does not start a season");
        Seasons.StartNext(limited, 2, 19, later, endEarly: true, victory: new(5, 10));
        Check(limited.Season == 3 && limited.Victory == new VictoryRule(5, 10) && Rules.Observe(limited, 0).Goal == 10, "The game creator can choose a new winning condition when starting a season");
        Check(GameCodec.Read(Json(limited)).Victory == new VictoryRule(5, 10), "The winning condition is saved with the campaign");

        // Saves.
        var legacy = Rules.Create(42017, now, false);
        var node = JsonNode.Parse(Json(legacy))!.AsObject();
        foreach (var name in new[] { "Season", "Started", "Ended", "History", "Victory" }) node.Remove(name);
        var reloaded = GameCodec.Read(node.ToJsonString());
        Check(reloaded.Season == 1 && reloaded.History.Count == 0 && reloaded.Started is null && Rules.Observe(reloaded, 0) is { Season: 1, Outcome: null },
            "A save from before seasons existed loads as season 1 with no history");
        legacy.Stars[1].Owner = 0; legacy.Stars[2].Owner = 0; legacy.Stars[3].Owner = 0; legacy.Stars[1].Collectors = 7; Rules.Resolve(legacy, legacy.Deadline);
        Seasons.StartNext(legacy, 1, 31, later);
        Check(legacy.Season == 2 && legacy.GeneratedMap is { RealCatalogVersion: not null, Seed: 31 } && legacy.History is [{ Winner: 0, MapSeed: 42017 }] && legacy.Stars.Count == 24,
            "A finished original-map campaign continues into a real-star season");
        var path = Path.Combine(Path.GetTempPath(), "deepfield-seasons-" + Guid.NewGuid().ToString("N"), "campaign.json");
        var store = new FileGameStore(path, () => Fresh(3));
        await store.Execute(g => { Win(g, 1); return true; });
        try { await store.Execute<bool>(g => { Seasons.StartNext(g, 1, 44, later); throw new RuleException("failed after starting"); }); } catch (RuleException) { }
        Check(await new FileGameStore(path, () => throw new Exception("missing")).Execute(g => g.Season == 1 && g.Winner == 1 && g.GeneratedMap!.Seed == 3, false), "A failed season start leaves the saved campaign unchanged");
        await store.Execute(g => { Seasons.StartNext(g, 1, 44, later); return true; });
        Check(await new FileGameStore(path, () => throw new Exception("missing")).Execute(g => g.Season == 2 && g.Winner is null && g.GeneratedMap!.Seed == 44 && g.History is [{ Winner: 1 }] && Rules.Linked(g, g.GeneratedMap.Links[0].From, g.GeneratedMap.Links[0].To), false),
            "A started season is saved and reloads with its new map and history");
        Console.WriteLine($"{count} season checks passed.");
    }
}
