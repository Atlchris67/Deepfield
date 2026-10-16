using System.Net;
using Deepfield.Engine;

namespace Deepfield.Api;

public static class LocalTurns
{
    public static bool Enabled(bool development, bool isolatedPreview, bool localTest)
        => development && (isolatedPreview || localTest);

    public static bool Allowed(bool enabled, HttpContext context)
        => enabled && context.Connection.RemoteIpAddress is {} ip && IPAddress.IsLoopback(ip)
        && (context.Request.Host.Host is "localhost" or "127.0.0.1" or "[::1]")
        && !context.Request.Headers.ContainsKey("Forwarded")
        && !context.Request.Headers.ContainsKey("X-Forwarded-For")
        && !context.Request.Headers.ContainsKey("CF-Connecting-IP");

    // Call only inside the store transaction shared with the daily worker.
    public static AdvanceResult Resolve(Game game, int expectedTurn, DateTimeOffset now)
    {
        if (game.Turn != expectedTurn || game.Winner != null) return new(false, game.Turn);
        game.Deadline = now;
        return new(Rules.Resolve(game, now), game.Turn);
    }
}

public record AdvanceResult(bool Advanced, int Turn);
