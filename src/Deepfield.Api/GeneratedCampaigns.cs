using System.Text.Json;
using Deepfield.Engine;

namespace Deepfield.Api;

// Generated campaigns live beside, never inside, the existing campaign save.
public sealed class GeneratedCampaigns(string directory)
{
    public string DirectoryPath => directory;

    private string PathFor(string id)
    {
        if (!Guid.TryParseExact(id, "N", out var parsed) || parsed.ToString("N") != id)
            throw new RuleException("Invalid generated campaign ID.");
        return Path.Combine(directory, id + ".json");
    }

    public IGameStore Existing(string id)
    {
        var path = PathFor(id);
        if (!File.Exists(path)) throw new RuleException("Generated campaign not found.");
        return new FileGameStore(path, () => throw new RuleException("Generated campaign not found."));
    }

    public async Task<Game> Start(string id, GeneratedStarMap snapshot, bool ai, int economyVersion, int combatVersion,
        int logisticsVersion = 0, int[]? industrialFocus = null, string? mode = null)
    {
        // Validate before touching the filesystem, even on a repeated request.
        var candidate = mode is null
            ? Rules.CreateFromMap(snapshot, DateTimeOffset.UtcNow, ai, economyVersion, combatVersion, logisticsVersion, industrialFocus)
            : Modes.Create(snapshot, DateTimeOffset.UtcNow, ai, mode, industrialFocus);
        var path = PathFor(id);
        var created = new FileGameStore(path, () => candidate);
        return await created.Execute(game =>
        {
            if (game.Mode != candidate.Mode || game.LogisticsVersion != candidate.LogisticsVersion || game.CombatVersion != candidate.CombatVersion ||
                game.Clans.Select(c => c.IndustrialFocus).Where((value, index) => value != candidate.Clans[index].IndustrialFocus).Any() ||
                game.GeneratedMap is null ||
                JsonSerializer.Serialize(game.GeneratedMap) != JsonSerializer.Serialize(snapshot))
                throw new RuleException("Campaign ID already belongs to another generated map.");
            return game;
        }, false);
    }

    public IEnumerable<IGameStore> ExistingStores()
    {
        if (!Directory.Exists(directory)) yield break;
        foreach (var path in Directory.EnumerateFiles(directory, "*.json"))
        {
            var id = Path.GetFileNameWithoutExtension(path);
            if (Guid.TryParseExact(id, "N", out _)) yield return Existing(id);
        }
    }
}

public sealed class GeneratedTurnWorker(GeneratedCampaigns campaigns, ILogger<GeneratedTurnWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(5));
        do
        {
            foreach (var store in campaigns.ExistingStores())
            {
                try { await store.Execute(game => Rules.Resolve(game, DateTimeOffset.UtcNow)); }
                catch (Exception ex) { logger.LogError(ex, "Generated campaign turn resolution failed."); }
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}
