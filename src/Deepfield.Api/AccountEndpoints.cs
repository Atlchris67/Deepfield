namespace Deepfield.Api;

public record SetupRequest(string? SetupKey, string? Email, string? DisplayName, string? Password, int Clan);
public record LoginRequest(string? Email, string? Password);
public record AcceptRequest(string? Token, string? Email, string? DisplayName, string? Password);
public record ResetRequest(string? Token, string? Password);
public record PasswordChange(string? Current, string? Next);
public record InviteRequest(int Clan, string? Note);
public record ClanChange(int Clan);

// Sign-in for hosted play. Routes are grouped by who may call them:
// /api/public (anyone), /api/account (signed in), /api/admin (campaign owner).
public sealed class AccountAccess(IAccountStore store, string? setupKey, string[] clanNames, bool development)
{
    public const string RequestHeader = "X-Deepfield-Request", RateLimitPolicy = "auth";
    // The __Host- prefix makes browsers refuse the cookie unless it is Secure, host-only and path "/".
    string CookieName => development ? "deepfield_session" : "__Host-deepfield_session";
    public IAccountStore Store => store;
    // The clans change when the game creator starts a season with a different number of them.
    public void SetClans(string[] names) => clanNames = names;
    string ClanName(int clan) => clan < clanNames.Length ? clanNames[clan] : "No clan this season";

    string? Token(HttpContext c) => c.Request.Cookies[CookieName];
    void SignIn(HttpContext c, string token) => c.Response.Cookies.Append(CookieName, token, new CookieOptions
    {
        HttpOnly = true, Secure = !development || c.Request.IsHttps, SameSite = SameSiteMode.Strict, Path = "/", IsEssential = true,
        Expires = DateTimeOffset.UtcNow + Accounts.SessionLifetime
    });
    void SignOut(HttpContext c) => c.Response.Cookies.Delete(CookieName, new CookieOptions { Secure = !development || c.Request.IsHttps, SameSite = SameSiteMode.Strict, Path = "/" });
    object Describe(Account a) => new { a.Id, a.Email, a.DisplayName, a.Clan, clanName = ClanName(a.Clan), a.Owner };
    static Account Current(HttpContext c) => (Account)c.Items["account"]!;

    // Returns false when the request has been answered and must not continue.
    public async Task<bool> Authorize(HttpContext c)
    {
        var path = c.Request.Path;
        // The session cookie is sent automatically by the browser, so state-changing calls must also carry
        // a header that another site cannot add without this server's permission.
        if (!HttpMethods.IsGet(c.Request.Method) && !HttpMethods.IsHead(c.Request.Method) && c.Request.Headers[RequestHeader] != "1")
        { c.Response.StatusCode = 403; await c.Response.WriteAsJsonAsync(new { error = "Request rejected." }); return false; }
        var token = Token(c);
        var account = token is null ? null : await store.Execute(book => Accounts.Authenticate(book, token, DateTimeOffset.UtcNow), false);
        if (account is not null) { c.Items["account"] = account; c.Items["team"] = account.Clan; }
        if (path.StartsWithSegments("/api/public")) return true;
        if (account is null) { c.Response.StatusCode = 401; await c.Response.WriteAsJsonAsync(new { error = "Sign in to continue." }); return false; }
        if (path.StartsWithSegments("/api/admin") && !account.Owner) { c.Response.StatusCode = 403; await c.Response.WriteAsJsonAsync(new { error = "Only the campaign owner can do this." }); return false; }
        return true;
    }

    public void Map(WebApplication app)
    {
        var now = () => DateTimeOffset.UtcNow;
        // Typed explicitly: a lambda taking only HttpContext would bind as a RequestDelegate and drop its result.
        app.MapGet("/api/public/state", (Delegate)(Func<HttpContext, Task<IResult>>)(async c => Results.Ok(new
        {
            mode = "accounts",
            setupRequired = await store.Execute(Accounts.SetupRequired, false),
            setupAvailable = setupKey is { Length: >= 24 },
            clans = clanNames,
            account = c.Items["account"] is Account a ? Describe(a) : null
        })));
        app.MapPost("/api/public/setup", async (HttpContext c, SetupRequest body) =>
        {
            var (account, token) = await store.Execute(book => Accounts.Setup(book, setupKey, body.SetupKey, body.Email, body.DisplayName, body.Password, body.Clan, clanNames.Length, now()));
            SignIn(c, token); return Results.Ok(new { account = Describe(account) });
        }).RequireRateLimiting(RateLimitPolicy);
        app.MapPost("/api/public/login", async (HttpContext c, LoginRequest body) =>
        {
            var result = await store.Execute(book => Accounts.Login(book, body.Email, body.Password, now()));
            if (result.Account is null) return Results.Json(new { error = result.Error }, statusCode: result.Status);
            SignIn(c, result.Token!); return Results.Ok(new { account = Describe(result.Account) });
        }).RequireRateLimiting(RateLimitPolicy);
        app.MapPost("/api/public/invitation", async (ResetRequest body) =>
        {
            var invitation = await store.Execute(book => Accounts.OpenInvitation(book, body.Token, now()), false);
            return invitation is null ? Results.Json(new { error = "This invitation is not valid. Ask the campaign owner for a new one." }, statusCode: 404)
                : Results.Ok(new { clan = invitation.Clan, clanName = ClanName(invitation.Clan), expires = invitation.Expires });
        }).RequireRateLimiting(RateLimitPolicy);
        app.MapPost("/api/public/accept", async (HttpContext c, AcceptRequest body) =>
        {
            var (account, token) = await store.Execute(book => Accounts.Accept(book, body.Token, body.Email, body.DisplayName, body.Password, now()));
            SignIn(c, token); return Results.Ok(new { account = Describe(account) });
        }).RequireRateLimiting(RateLimitPolicy);
        app.MapPost("/api/public/reset", async (HttpContext c, ResetRequest body) =>
        {
            var (account, token) = await store.Execute(book => Accounts.Reset(book, body.Token, body.Password, now()));
            SignIn(c, token); return Results.Ok(new { account = Describe(account) });
        }).RequireRateLimiting(RateLimitPolicy);

        app.MapPost("/api/account/logout", (Delegate)(Func<HttpContext, Task<IResult>>)(async c =>
        {
            var token = Token(c); await store.Execute(book => { Accounts.Logout(book, token); return true; });
            SignOut(c); return Results.Ok(new { });
        }));
        app.MapPost("/api/account/password", async (HttpContext c, PasswordChange body) =>
        {
            var token = Token(c); var id = Current(c).Id;
            await store.Execute(book => { Accounts.ChangePassword(book, id, body.Current, body.Next, token, now()); return true; });
            return Results.Ok(new { });
        }).RequireRateLimiting(RateLimitPolicy);

        app.MapGet("/api/admin/players", async () => Results.Ok(await store.Execute(book => new
        {
            players = book.Accounts.Select(Accounts.View).ToList(),
            invitations = book.Invitations.OrderByDescending(i => i.Created).Select(i => Accounts.View(i, now())).ToList()
        }, false)));
        app.MapPost("/api/admin/invitations", async (HttpContext c, InviteRequest body) =>
        {
            var owner = Current(c).Id;
            var (invitation, token) = await store.Execute(book => Accounts.Invite(book, owner, body.Clan, body.Note, clanNames.Length, now()));
            // The token is shown once here; only its hash is stored.
            return Results.Ok(new { invitation = Accounts.View(invitation, now()), token });
        });
        app.MapPost("/api/admin/invitations/{id}/revoke", async (HttpContext c, string id) =>
        {
            var owner = Current(c).Id; await store.Execute(book => { Accounts.RevokeInvitation(book, owner, id); return true; });
            return Results.Ok(new { });
        });
        app.MapPost("/api/admin/players/{id}/disable", (HttpContext c, string id) => SetDisabled(c, id, true));
        app.MapPost("/api/admin/players/{id}/enable", (HttpContext c, string id) => SetDisabled(c, id, false));
        app.MapPost("/api/admin/players/{id}/clan", async (HttpContext c, string id, ClanChange body) =>
        {
            var owner = Current(c).Id; await store.Execute(book => { Accounts.MoveClan(book, owner, id, body.Clan, clanNames.Length); return true; });
            return Results.Ok(new { });
        });
        app.MapPost("/api/admin/players/{id}/reset", async (HttpContext c, string id) =>
        {
            var owner = Current(c).Id;
            return Results.Ok(new { token = await store.Execute(book => Accounts.IssueReset(book, owner, id, now())) });
        });
    }
    async Task<IResult> SetDisabled(HttpContext c, string id, bool disabled)
    {
        var owner = Current(c).Id; await store.Execute(book => { Accounts.SetDisabled(book, owner, id, disabled); return true; });
        return Results.Ok(new { });
    }
}
