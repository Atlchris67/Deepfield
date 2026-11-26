using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Identity;

namespace Deepfield.Api;

// Personal accounts for hosted play. Everything here is plain data plus pure functions over it,
// so the same rules run against the file store, PostgreSQL and the checks suite.
public sealed class Account
{
    public string Id { get; set; } = "";
    public string Email { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public int Clan { get; set; }
    public bool Owner { get; set; }
    public bool Disabled { get; set; }
    public DateTimeOffset Created { get; set; }
    public int FailedLogins { get; set; }
    public DateTimeOffset? LockedUntil { get; set; }
}
public sealed class Invitation
{
    public string Id { get; set; } = "";
    public string TokenHash { get; set; } = "";
    public int Clan { get; set; }
    public string Note { get; set; } = "";
    public DateTimeOffset Created { get; set; }
    public DateTimeOffset Expires { get; set; }
    public string? UsedBy { get; set; }
    public bool Revoked { get; set; }
}
public sealed class LoginSession
{
    public string TokenHash { get; set; } = "";
    public string AccountId { get; set; } = "";
    public DateTimeOffset Created { get; set; }
    public DateTimeOffset Expires { get; set; }
}
public sealed class PasswordReset
{
    public string TokenHash { get; set; } = "";
    public string AccountId { get; set; } = "";
    public DateTimeOffset Expires { get; set; }
}
public sealed class AccountBook
{
    public int Schema { get; set; } = 1;
    public List<Account> Accounts { get; set; } = [];
    public List<Invitation> Invitations { get; set; } = [];
    public List<LoginSession> Sessions { get; set; } = [];
    public List<PasswordReset> Resets { get; set; } = [];
}

public sealed class AccountException(string message, int status = 409) : Exception(message)
{
    public int Status => status;
}
public record AccountView(string Id, string Email, string DisplayName, int Clan, bool Owner, bool Disabled, DateTimeOffset Created);
public record InvitationView(string Id, int Clan, string Note, DateTimeOffset Created, DateTimeOffset Expires, string Status);
public record LoginResult(Account? Account, string? Token, string? Error, int Status = 200);

public static class Accounts
{
    public const int MinimumPassword = 10, MaximumPassword = 200, MaximumAccounts = 200, MaximumOpenInvitations = 50, MaximumSessionsPerAccount = 10;
    public const int LockoutFailures = 5;
    public static readonly TimeSpan SessionLifetime = TimeSpan.FromDays(30), InvitationLifetime = TimeSpan.FromDays(7),
        ResetLifetime = TimeSpan.FromHours(24), LockoutDuration = TimeSpan.FromMinutes(15);
    const string BadLogin = "Email or password was not accepted.";
    static readonly PasswordHasher<Account> Hasher = new();
    // Verified against when the email is unknown, so unknown and known addresses cost the same time.
    static readonly string DecoyHash = Hasher.HashPassword(new Account(), NewToken());

    public static string NewToken() => Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    // Tokens are high-entropy random values, so a plain SHA-256 is enough to keep the stored copy unusable.
    public static string Hash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
    public static AccountView View(Account a) => new(a.Id, a.Email, a.DisplayName, a.Clan, a.Owner, a.Disabled, a.Created);

    public static string NormalizeEmail(string? email)
    {
        var value = (email ?? "").Trim().ToLowerInvariant();
        var at = value.IndexOf('@');
        if (value.Length is < 3 or > 254 || at <= 0 || at != value.LastIndexOf('@') || at == value.Length - 1 ||
            value.Any(char.IsWhiteSpace) || !value[(at + 1)..].Contains('.') || value.EndsWith('.'))
            throw new AccountException("Enter a valid email address.");
        return value;
    }
    static string NormalizeName(string? name)
    {
        var value = (name ?? "").Trim();
        if (value.Length is < 1 or > 40 || value.Any(char.IsControl)) throw new AccountException("Enter a display name of 1 to 40 characters.");
        return value;
    }
    static void RequirePassword(string? password)
    {
        if (password is null || password.Length < MinimumPassword || password.Length > MaximumPassword)
            throw new AccountException($"Choose a password of {MinimumPassword} to {MaximumPassword} characters.");
    }
    static void RequireClan(int clan, int clanCount)
    {
        if (clan < 0 || clan >= clanCount) throw new AccountException("Unknown clan.");
    }
    static Account RequireOwner(AccountBook book, string ownerId)
        => book.Accounts.Find(a => a.Id == ownerId && a.Owner && !a.Disabled) ?? throw new AccountException("Only the campaign owner can do this.", 403);
    static Account RequireMember(AccountBook book, string accountId)
        => book.Accounts.Find(a => a.Id == accountId) ?? throw new AccountException("Player not found.", 404);

    static Account Create(AccountBook book, string? email, string? name, string? password, int clan, bool owner, DateTimeOffset now)
    {
        var normalized = NormalizeEmail(email); var display = NormalizeName(name); RequirePassword(password);
        if (book.Accounts.Count >= MaximumAccounts) throw new AccountException("This campaign has reached its player limit.");
        if (book.Accounts.Any(a => a.Email == normalized)) throw new AccountException("An account with this email already exists.");
        if (book.Accounts.Any(a => string.Equals(a.DisplayName, display, StringComparison.OrdinalIgnoreCase)))
            throw new AccountException("That display name is already taken.");
        var account = new Account { Id = Guid.NewGuid().ToString("N"), Email = normalized, DisplayName = display, Clan = clan, Owner = owner, Created = now };
        account.PasswordHash = Hasher.HashPassword(account, password!);
        book.Accounts.Add(account);
        return account;
    }
    static string OpenSession(AccountBook book, Account account, DateTimeOffset now)
    {
        var token = NewToken();
        book.Sessions.Add(new LoginSession { TokenHash = Hash(token), AccountId = account.Id, Created = now, Expires = now + SessionLifetime });
        var mine = book.Sessions.Where(s => s.AccountId == account.Id).OrderByDescending(s => s.Created).Skip(MaximumSessionsPerAccount).ToList();
        foreach (var old in mine) book.Sessions.Remove(old);
        return token;
    }
    public static void Prune(AccountBook book, DateTimeOffset now)
    {
        book.Sessions.RemoveAll(s => s.Expires <= now);
        book.Resets.RemoveAll(r => r.Expires <= now);
        book.Invitations.RemoveAll(i => i.Expires + TimeSpan.FromDays(30) <= now);
    }

    public static bool SetupRequired(AccountBook book) => book.Accounts.Count == 0;
    // The first account is created with the operator's setup key and becomes the owner. It works only once.
    public static (Account Account, string Token) Setup(AccountBook book, string? configuredKey, string? suppliedKey, string? email, string? name, string? password, int clan, int clanCount, DateTimeOffset now)
    {
        if (!SetupRequired(book)) throw new AccountException("The owner account already exists.", 404);
        if (string.IsNullOrEmpty(configuredKey) || configuredKey.Length < 24) throw new AccountException("Owner setup is not configured on this server.", 404);
        if (suppliedKey is null || !CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(suppliedKey), Encoding.UTF8.GetBytes(configuredKey)))
            throw new AccountException("Setup key was not accepted.", 401);
        RequireClan(clan, clanCount);
        var account = Create(book, email, name, password, clan, true, now);
        return (account, OpenSession(book, account, now));
    }

    public static (Invitation Invitation, string Token) Invite(AccountBook book, string ownerId, int clan, string? note, int clanCount, DateTimeOffset now)
    {
        RequireOwner(book, ownerId); RequireClan(clan, clanCount); Prune(book, now);
        var text = (note ?? "").Trim();
        if (text.Length > 80 || text.Any(char.IsControl)) throw new AccountException("Keep the invitation note to 80 characters.");
        if (book.Invitations.Count(i => Status(i, now) == "open") >= MaximumOpenInvitations) throw new AccountException("Too many open invitations. Revoke one first.");
        var token = NewToken();
        var invitation = new Invitation { Id = Guid.NewGuid().ToString("N"), TokenHash = Hash(token), Clan = clan, Note = text, Created = now, Expires = now + InvitationLifetime };
        book.Invitations.Add(invitation);
        return (invitation, token);
    }
    public static string Status(Invitation i, DateTimeOffset now) => i.UsedBy is not null ? "used" : i.Revoked ? "revoked" : i.Expires <= now ? "expired" : "open";
    public static InvitationView View(Invitation i, DateTimeOffset now) => new(i.Id, i.Clan, i.Note, i.Created, i.Expires, Status(i, now));
    public static Invitation? OpenInvitation(AccountBook book, string? token, DateTimeOffset now)
    {
        if (string.IsNullOrEmpty(token) || token.Length > 100) return null;
        var hash = Hash(token);
        return book.Invitations.Find(i => i.TokenHash == hash && Status(i, now) == "open");
    }
    public static void RevokeInvitation(AccountBook book, string ownerId, string invitationId)
    {
        RequireOwner(book, ownerId);
        var invitation = book.Invitations.Find(i => i.Id == invitationId) ?? throw new AccountException("Invitation not found.", 404);
        if (invitation.UsedBy is null) invitation.Revoked = true;
    }
    public static (Account Account, string Token) Accept(AccountBook book, string? token, string? email, string? name, string? password, DateTimeOffset now)
    {
        var invitation = OpenInvitation(book, token, now) ?? throw new AccountException("This invitation is not valid. Ask the campaign owner for a new one.", 404);
        var account = Create(book, email, name, password, invitation.Clan, false, now);
        invitation.UsedBy = account.Id;
        return (account, OpenSession(book, account, now));
    }

    // Never throws for a failed attempt: the failure counter must be saved.
    public static LoginResult Login(AccountBook book, string? email, string? password, DateTimeOffset now)
    {
        Prune(book, now);
        string normalized;
        try { normalized = NormalizeEmail(email); } catch (AccountException) { normalized = ""; }
        var account = book.Accounts.Find(a => a.Email == normalized);
        if (account is null || password is null || password.Length > MaximumPassword)
        {
            Hasher.VerifyHashedPassword(new Account(), DecoyHash, password is { Length: <= MaximumPassword } ? password : "");
            return new(null, null, BadLogin, 401);
        }
        if (account.LockedUntil is { } locked && locked > now)
            return new(null, null, "Too many failed attempts. Try again in a few minutes, or ask the campaign owner for a reset link.", 429);
        var verdict = Hasher.VerifyHashedPassword(account, account.PasswordHash, password);
        if (verdict == PasswordVerificationResult.Failed || account.Disabled)
        {
            if (verdict == PasswordVerificationResult.Failed && ++account.FailedLogins >= LockoutFailures)
            { account.FailedLogins = 0; account.LockedUntil = now + LockoutDuration; }
            return new(null, null, BadLogin, 401);
        }
        if (verdict == PasswordVerificationResult.SuccessRehashNeeded) account.PasswordHash = Hasher.HashPassword(account, password);
        account.FailedLogins = 0; account.LockedUntil = null;
        return new(account, OpenSession(book, account, now), null);
    }
    public static Account? Authenticate(AccountBook book, string? token, DateTimeOffset now)
    {
        if (string.IsNullOrEmpty(token) || token.Length > 100) return null;
        var hash = Hash(token);
        var session = book.Sessions.Find(s => s.TokenHash == hash && s.Expires > now);
        return session is null ? null : book.Accounts.Find(a => a.Id == session.AccountId && !a.Disabled);
    }
    public static void Logout(AccountBook book, string? token)
    {
        if (string.IsNullOrEmpty(token)) return;
        var hash = Hash(token); book.Sessions.RemoveAll(s => s.TokenHash == hash);
    }
    // Changing a password signs out every other device.
    public static void ChangePassword(AccountBook book, string accountId, string? current, string? next, string? keepToken, DateTimeOffset now)
    {
        var account = RequireMember(book, accountId);
        if (current is null || current.Length > MaximumPassword || Hasher.VerifyHashedPassword(account, account.PasswordHash, current) == PasswordVerificationResult.Failed)
            throw new AccountException("Current password was not accepted.", 401);
        RequirePassword(next);
        account.PasswordHash = Hasher.HashPassword(account, next!);
        var keep = string.IsNullOrEmpty(keepToken) ? null : Hash(keepToken);
        book.Sessions.RemoveAll(s => s.AccountId == account.Id && s.TokenHash != keep);
    }

    public static void SetDisabled(AccountBook book, string ownerId, string accountId, bool disabled)
    {
        RequireOwner(book, ownerId); var account = RequireMember(book, accountId);
        if (account.Owner) throw new AccountException("The owner account cannot be disabled.");
        account.Disabled = disabled;
        if (disabled) { book.Sessions.RemoveAll(s => s.AccountId == account.Id); book.Resets.RemoveAll(r => r.AccountId == account.Id); }
    }
    public static void MoveClan(AccountBook book, string ownerId, string accountId, int clan, int clanCount)
    {
        RequireOwner(book, ownerId); RequireClan(clan, clanCount);
        RequireMember(book, accountId).Clan = clan;
    }
    // There is no email service: the owner creates a one-time reset link and passes it to the player.
    public static string IssueReset(AccountBook book, string ownerId, string accountId, DateTimeOffset now)
    {
        RequireOwner(book, ownerId); var account = RequireMember(book, accountId); Prune(book, now);
        if (account.Disabled) throw new AccountException("Enable this player before issuing a reset link.");
        book.Resets.RemoveAll(r => r.AccountId == account.Id);
        var token = NewToken();
        book.Resets.Add(new PasswordReset { TokenHash = Hash(token), AccountId = account.Id, Expires = now + ResetLifetime });
        return token;
    }
    public static (Account Account, string Token) Reset(AccountBook book, string? token, string? password, DateTimeOffset now)
    {
        var hash = string.IsNullOrEmpty(token) || token.Length > 100 ? "" : Hash(token);
        var reset = book.Resets.Find(r => r.TokenHash == hash && r.Expires > now) ?? throw new AccountException("This reset link is not valid. Ask the campaign owner for a new one.", 404);
        var account = book.Accounts.Find(a => a.Id == reset.AccountId && !a.Disabled) ?? throw new AccountException("This reset link is not valid. Ask the campaign owner for a new one.", 404);
        RequirePassword(password);
        account.PasswordHash = Hasher.HashPassword(account, password!);
        account.FailedLogins = 0; account.LockedUntil = null;
        book.Resets.Remove(reset);
        book.Sessions.RemoveAll(s => s.AccountId == account.Id);
        return (account, OpenSession(book, account, now));
    }
}
