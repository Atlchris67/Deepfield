using System.Text.Json;
using Deepfield.Api;

public static class AccountChecks
{
    public static async Task Run()
    {
        var count = 0; var now = DateTimeOffset.Parse("2026-11-26T12:00:00Z");
        void Check(bool ok, string label) { if (!ok) throw new Exception(label); count++; Console.WriteLine("PASS " + label); }
        int Status(Action action) { try { action(); return 200; } catch (AccountException ex) { return ex.Status; } }
        const string setupKey = "setup-key-with-at-least-24-characters", password = "correct horse battery";

        var book = new AccountBook();
        Check(Accounts.SetupRequired(book), "An empty account book needs owner setup");
        Check(Status(() => Accounts.Setup(book, null, setupKey, "owner@example.com", "Owner", password, 0, 2, now)) == 404 &&
              Status(() => Accounts.Setup(book, "short", "short", "owner@example.com", "Owner", password, 0, 2, now)) == 404,
            "Owner setup is unavailable without a configured setup key of at least 24 characters");
        Check(Status(() => Accounts.Setup(book, setupKey, "wrong-key-with-at-least-24-characters", "owner@example.com", "Owner", password, 0, 2, now)) == 401 && book.Accounts.Count == 0,
            "A wrong setup key creates nothing");
        Check(Status(() => Accounts.Setup(book, setupKey, setupKey, "not-an-email", "Owner", password, 0, 2, now)) == 409 &&
              Status(() => Accounts.Setup(book, setupKey, setupKey, "owner@example.com", "Owner", "short", 0, 2, now)) == 409 &&
              Status(() => Accounts.Setup(book, setupKey, setupKey, "owner@example.com", "Owner", password, 2, 2, now)) == 409 && book.Accounts.Count == 0,
            "Setup rejects an invalid email, a short password and an unknown clan");
        var (owner, ownerToken) = Accounts.Setup(book, setupKey, setupKey, " Owner@Example.COM ", " Owner ", password, 0, 2, now);
        Check(owner.Owner && owner.Email == "owner@example.com" && owner.DisplayName == "Owner" && owner.Clan == 0 && Accounts.Authenticate(book, ownerToken, now)?.Id == owner.Id,
            "Setup creates the signed-in owner with a normalized email");
        Check(Status(() => Accounts.Setup(book, setupKey, setupKey, "second@example.com", "Second", password, 1, 2, now)) == 404 && book.Accounts.Count == 1,
            "Owner setup works only once");

        var stored = JsonSerializer.Serialize(book);
        Check(!stored.Contains(password) && !stored.Contains(ownerToken) && owner.PasswordHash.Length > 40,
            "Stored accounts contain neither the password nor the session token");

        var (invitation, inviteToken) = Accounts.Invite(book, owner.Id, 1, "For Sam", 2, now);
        Check(!JsonSerializer.Serialize(book).Contains(inviteToken) && Accounts.OpenInvitation(book, inviteToken, now)?.Clan == 1 && Accounts.OpenInvitation(book, "guess", now) is null,
            "An invitation is found only by its secret link token, which is stored hashed");
        Check(Status(() => Accounts.Invite(book, owner.Id, 5, null, 2, now)) == 409 && Status(() => Accounts.Invite(book, "nobody", 1, null, 2, now)) == 403,
            "Only the owner can invite, and only to an existing clan");
        Check(Status(() => Accounts.Accept(book, inviteToken, "owner@example.com", "Sam", password, now)) == 409 &&
              Status(() => Accounts.Accept(book, inviteToken, "sam@example.com", "owner", password, now)) == 409 &&
              Accounts.OpenInvitation(book, inviteToken, now) is not null,
            "A duplicate email or display name is refused without using up the invitation");
        var (sam, samToken) = Accounts.Accept(book, inviteToken, "sam@example.com", "Sam", password, now);
        Check(!sam.Owner && sam.Clan == 1 && Accounts.Authenticate(book, samToken, now)?.Id == sam.Id && Accounts.Status(invitation, now) == "used",
            "Accepting an invitation creates a signed-in player in the invited clan");
        Check(Status(() => Accounts.Accept(book, inviteToken, "other@example.com", "Other", password, now)) == 404, "An invitation works only once");
        var (_, expiring) = Accounts.Invite(book, owner.Id, 0, null, 2, now);
        Check(Accounts.OpenInvitation(book, expiring, now + Accounts.InvitationLifetime) is null &&
              Status(() => Accounts.Accept(book, expiring, "late@example.com", "Late", password, now + Accounts.InvitationLifetime)) == 404,
            "An invitation expires after seven days");
        var (revoked, revokedToken) = Accounts.Invite(book, owner.Id, 0, null, 2, now);
        Check(Status(() => Accounts.RevokeInvitation(book, sam.Id, revoked.Id)) == 403, "A player cannot revoke invitations");
        Accounts.RevokeInvitation(book, owner.Id, revoked.Id);
        Check(Accounts.OpenInvitation(book, revokedToken, now) is null && Accounts.Status(revoked, now) == "revoked", "A revoked invitation stops working");
        Check(Status(() => Accounts.Invite(book, sam.Id, 1, null, 2, now)) == 403, "A player cannot create invitations");

        var unknown = Accounts.Login(book, "nobody@example.com", password, now); var wrong = Accounts.Login(book, "sam@example.com", "wrong password!", now);
        Check(unknown.Account is null && wrong.Account is null && unknown.Status == 401 && wrong.Status == 401 && unknown.Error == wrong.Error,
            "Unknown email and wrong password give the same answer");
        var signedIn = Accounts.Login(book, " SAM@example.com", password, now);
        Check(signedIn.Account?.Id == sam.Id && signedIn.Token != samToken && Accounts.Authenticate(book, signedIn.Token, now)?.Id == sam.Id && sam.FailedLogins == 0,
            "A correct password signs in with a fresh session and clears the failure count");
        for (var i = 0; i < Accounts.LockoutFailures; i++) Accounts.Login(book, "sam@example.com", "wrong password!", now);
        Check(Accounts.Login(book, "sam@example.com", password, now).Status == 429 && Accounts.Authenticate(book, samToken, now) is not null,
            "Five wrong passwords lock sign-in for that account without ending existing sessions");
        Check(Accounts.Login(book, "sam@example.com", password, now + Accounts.LockoutDuration).Account is not null, "The lock ends after fifteen minutes");
        Check(Accounts.Authenticate(book, samToken, now + Accounts.SessionLifetime) is null && Accounts.Authenticate(book, "", now) is null && Accounts.Authenticate(book, null, now) is null,
            "Sessions expire after thirty days and empty tokens never authenticate");

        Check(Status(() => Accounts.ChangePassword(book, sam.Id, "wrong password!", "another long password", samToken, now)) == 401 &&
              Status(() => Accounts.ChangePassword(book, sam.Id, password, "short", samToken, now)) == 409, "Changing a password needs the current one and a valid new one");
        Accounts.ChangePassword(book, sam.Id, password, "another long password", samToken, now);
        Check(Accounts.Authenticate(book, samToken, now) is not null && Accounts.Authenticate(book, signedIn.Token, now) is null &&
              Accounts.Login(book, "sam@example.com", password, now).Account is null && Accounts.Login(book, "sam@example.com", "another long password", now).Account is not null,
            "Changing a password keeps this device signed in and signs out the others");

        Check(Status(() => Accounts.IssueReset(book, sam.Id, owner.Id, now)) == 403, "A player cannot issue reset links");
        var resetToken = Accounts.IssueReset(book, owner.Id, sam.Id, now);
        Check(!JsonSerializer.Serialize(book).Contains(resetToken) && Status(() => Accounts.Reset(book, "guess", "reset password one", now)) == 404 &&
              Status(() => Accounts.Reset(book, resetToken, "reset password one", now + Accounts.ResetLifetime)) == 404, "A reset link is secret, stored hashed and expires after a day");
        var (_, afterReset) = Accounts.Reset(book, resetToken, "reset password one", now);
        Check(Accounts.Authenticate(book, samToken, now) is null && Accounts.Authenticate(book, afterReset, now)?.Id == sam.Id &&
              Status(() => Accounts.Reset(book, resetToken, "reset password two", now)) == 404 && Accounts.Login(book, "sam@example.com", "reset password one", now).Account is not null,
            "A reset link works once, sets the new password and signs out earlier sessions");

        Accounts.MoveClan(book, owner.Id, sam.Id, 0, 2);
        Check(Accounts.Authenticate(book, afterReset, now)?.Clan == 0 && Status(() => Accounts.MoveClan(book, owner.Id, sam.Id, 9, 2)) == 409 &&
              Status(() => Accounts.MoveClan(book, sam.Id, owner.Id, 1, 2)) == 403, "Only the owner can move a player to another existing clan, effective immediately");
        Check(Status(() => Accounts.SetDisabled(book, owner.Id, owner.Id, true)) == 409 && Status(() => Accounts.SetDisabled(book, sam.Id, owner.Id, true)) == 403,
            "The owner account cannot be disabled");
        Accounts.SetDisabled(book, owner.Id, sam.Id, true);
        Check(Accounts.Authenticate(book, afterReset, now) is null && Accounts.Login(book, "sam@example.com", "reset password one", now).Account is null &&
              Status(() => Accounts.IssueReset(book, owner.Id, sam.Id, now)) == 409, "Disabling a player signs them out and blocks sign-in and resets");
        Accounts.SetDisabled(book, owner.Id, sam.Id, false);
        Check(Accounts.Login(book, "sam@example.com", "reset password one", now).Account is not null, "Enabling a player restores sign-in");
        Accounts.Logout(book, ownerToken);
        Check(Accounts.Authenticate(book, ownerToken, now) is null, "Signing out ends the session");
        for (var i = 0; i < Accounts.MaximumSessionsPerAccount + 3; i++) Accounts.Login(book, "owner@example.com", password, now.AddSeconds(i));
        Check(book.Sessions.Count(s => s.AccountId == owner.Id) == Accounts.MaximumSessionsPerAccount, "Each account keeps at most ten sessions");

        var directory = Path.Combine(Path.GetTempPath(), "deepfield-accounts-" + Guid.NewGuid()); var path = Path.Combine(directory, "accounts.json");
        await StoreChecks(new FileAccountStore(path), () => new FileAccountStore(path), Check, "File");
        var connection = Environment.GetEnvironmentVariable("DEEPFIELD_TEST_POSTGRES");
        if (connection is not null)
        {
            var pg = new PostgresAccountStore(connection); await pg.Initialize(); await pg.Initialize();
            await StoreChecks(pg, () => new PostgresAccountStore(connection), Check, "PostgreSQL");
        }
        else Console.WriteLine("SKIP PostgreSQL account store: DEEPFIELD_TEST_POSTGRES not configured.");
        Console.WriteLine($"{count} account checks passed.");
    }

    static async Task StoreChecks(IAccountStore store, Func<IAccountStore> reopen, Action<bool, string> check, string name)
    {
        var now = DateTimeOffset.UtcNow; const string key = "store-setup-key-with-24-characters", password = "a long enough password";
        var token = await store.Execute(book => Accounts.Setup(book, key, key, name.ToLowerInvariant() + "@example.com", name + " owner", password, 0, 2, now).Token);
        check(await reopen().Execute(book => Accounts.Authenticate(book, token, now)?.Owner == true, false), name + " account store persists the owner and session across reopening");
        try { await store.Execute<bool>(book => { book.Accounts.Clear(); throw new AccountException("failed operation"); }); } catch (AccountException) { }
        check(await reopen().Execute(book => book.Accounts.Count == 1, false), name + " account store discards changes from a failed operation");
        await store.Execute(book => { book.Accounts.Clear(); return true; }, false);
        check(await reopen().Execute(book => book.Accounts.Count == 1, false), name + " account store does not save read-only operations");
        var results = await Task.WhenAll(Enumerable.Range(0, 8).Select(i => reopen().Execute(book => Accounts.Login(book, name.ToLowerInvariant() + "@example.com", password, now.AddSeconds(i)).Account is not null)));
        check(results.All(ok => ok) && await reopen().Execute(book => book.Sessions.Count == 9, false), name + " account store applies concurrent sign-ins without losing any");
    }
}
