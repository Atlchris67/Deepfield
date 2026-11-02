using System.Buffers.Binary;
using System.Security.Cryptography;
using System.Text;

namespace Deepfield.Engine;

/// <summary>Fictional resources for real-system campaigns. Indices are saved-game keys.</summary>
public static class Materials
{
    public static readonly string[] Names = ["Ferrite", "Vardite", "Ceryth", "Neralite", "Soryl", "Avenite"];
    public const int Count = 6;
    public static int[] StartingStock() => [18, 12, 12, 14, 12, 8];
    public static int[] Cost(Order order) => order.Kind switch
    {
        "build" => [order.Ships, 0, 0, order.Ships, 0, 0],
        "scoutbuild" => [0, 0, order.Ships, order.Ships, 0, 0],
        "defense" => [2, 1, 0, 0, 0, 0],
        "collector" => [0, 0, 1, 0, 1, 0],
        "mine" => [2, 0, 0, 0, 0, 0],
        "settlement" => [2, 0, 0, 0, 0, 1],
        "freighter" => [2 * order.Ships, 0, order.Ships, 2 * order.Ships, 0, 0],
        "gate" => [4, 0, 2, 0, 0, 2],
        "refit" => ShipDesign.MaterialCost(order.Package ?? ""),
        _ => [0, 0, 0, 0, 0, 0]
    };
    public static int Kind(Game game, int systemId, int planetId)
    {
        // Home deposits are assigned at creation from the pinned map, not clan names.
        // A single-planet home gets a second basic fuel deposit (see Production).
        if (game.MaterialsVersion == 1 && game.GeneratedMap?.Homeworlds.Any(h => h.SystemId == systemId) == true)
        {
            var planets = game.GeneratedMap.RealSystems![systemId].Planets;
            if (planets.Count > 0 && planetId == planets[0].Id) return 0;
            if (planets.Count > 1 && planetId == planets[1].Id) return 3;
        }
        var entropy = game.ReconEntropy ?? throw new InvalidOperationException("Campaign entropy is missing.");
        var key = Encoding.UTF8.GetBytes($"materials-v1|{systemId}|{planetId}");
        var bytes = HMACSHA256.HashData(Convert.FromHexString(entropy), key);
        return (int)(BinaryPrimitives.ReadUInt32LittleEndian(bytes) % Count);
    }
    public static int[] Survey(Game game, int systemId)
    {
        var result = new int[Count];
        var systems = game.GeneratedMap?.RealSystems;
        if (systems is null || systemId < 0 || systemId >= systems.Count) return result;
        foreach (var planet in systems[systemId].Planets)
            result[Kind(game, systemId, planet.Id)]++;
        if (game.MaterialsVersion == 1 && systems[systemId].Planets.Count == 1 &&
            game.GeneratedMap!.Homeworlds.Any(h => h.SystemId == systemId)) result[3]++;
        return result;
    }
    public static int[] Production(Game game, Star star)
    {
        var result = new int[Count];
        if (star.Owner is null || game.GeneratedMap?.RealSystems is null) return result;
        foreach (var planet in game.GeneratedMap.RealSystems[star.Id].Planets)
        {
            var baseYield = Math.Max(1, star.SettlementSize) * (1 + star.Mines);
            if (game.MaterialsVersion == 1) baseYield = (baseYield * 3 + 1) / 2;
            var focus = game.Clans[star.Owner.Value].IndustrialFocus;
            var yield = Math.Max(1, (baseYield * (4 + focus) + 3) / 4);
            result[Kind(game, star.Id, planet.Id)] += yield;
            if (game.MaterialsVersion == 1 && game.GeneratedMap.RealSystems[star.Id].Planets.Count == 1 &&
                game.GeneratedMap.Homeworlds.Any(h => h.SystemId == star.Id)) result[3] += yield;
        }
        return result;
    }
}
