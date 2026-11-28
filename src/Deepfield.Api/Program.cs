using System.Security.Cryptography;
using System.Text;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.HttpOverrides;
using Deepfield.Api;
using Deepfield.Engine;

var builder=WebApplication.CreateBuilder(args);
var connection=builder.Configuration.GetConnectionString("Deepfield");
var savePath=PreviewStorage.Resolve(builder.Configuration.GetValue<bool>("IsolatedPreview"),builder.Environment.IsDevelopment(),connection,builder.Configuration["SavePath"]);
builder.WebHost.ConfigureKestrel(o=>o.Limits.MaxRequestBodySize=16*1024);
// "keys" is the original shared clan-key sign-in, kept for local development and existing saves.
// "accounts" is personal sign-in for hosted play and is the default outside Development.
var authMode=(builder.Configuration["Auth:Mode"]??(builder.Environment.IsDevelopment()?"keys":"accounts")).Trim().ToLowerInvariant();
if(authMode is not ("keys" or "accounts")) throw new InvalidOperationException("Auth__Mode must be 'keys' or 'accounts'.");
// Two clan keys are required. A third and fourth are needed only to play a season with three or four clans.
var keys = Enumerable.Range(0,Rules.MaximumClans).Select(team=>builder.Configuration[$"Teams:{team}:Key"]).TakeWhile(k=>!string.IsNullOrWhiteSpace(k)).ToArray();
if(authMode=="keys" && (keys.Length<2 || keys.Any(k=>k!.Length<24) || keys.Distinct().Count()!=keys.Length))
    throw new InvalidOperationException("Set distinct Teams__0__Key and Teams__1__Key environment values (at least 24 characters), and Teams__2__Key and Teams__3__Key for a third and fourth clan.");
var localTest=LocalTurns.Enabled(builder.Environment.IsDevelopment(),builder.Configuration.GetValue<bool>("IsolatedPreview"),builder.Configuration.GetValue<bool>("LocalTest"));
// Map seed 0 is the original fixed layout. A hosted campaign with accounts gets a random layout unless MapSeed is set;
// local development keeps the fixed layout unless MapSeed is set, so existing tests and habits are unchanged.
int RandomMapSeed()=>RandomNumberGenerator.GetInt32(1,int.MaxValue);
int NewMapSeed()=>builder.Configuration.GetValue<int?>("MapSeed")??(authMode=="accounts"?RandomMapSeed():0);
// The winning condition of a new campaign. The game creator can change it before the first turn resolves and for each later season.
VictoryRule? ConfiguredVictory()=>builder.Configuration.GetSection("Victory").Exists()
    ? new VictoryRule(builder.Configuration.GetValue("Victory:Colonies",VictoryRule.Standard.Colonies),builder.Configuration.GetValue("Victory:Collectors",VictoryRule.Standard.Collectors),builder.Configuration.GetValue("Victory:TurnLimit",0)).Validated() : null;
Game NewGame(){var game=NewCampaign();if(ConfiguredVictory() is {} configured)game.Victory=configured;return game;}
// A hosted campaign with personal accounts is created in a mode chosen by its creator: the Mode setting, or simple.
// The owner can still change it in the game before the first turn resolves. Modes always use the real-star map.
// A clan-key development server keeps the older rule-version settings unless Mode is set, so existing saves and tests are unchanged.
// An existing save or database row is never replaced, so all of this affects only a campaign that does not exist yet.
string? ConfiguredMode()=>builder.Configuration["Mode"] is {Length:>0} mode ? Modes.Validated(mode.ToLowerInvariant()) : authMode=="accounts" ? Modes.Simple : null;
Game NewCampaign()=>ConfiguredMode() is {} mode
    ? Modes.Create(RealStarMap.Generate(NewMapSeed(),builder.Configuration.GetValue("Clans",2)),DateTimeOffset.UtcNow,builder.Configuration.GetValue("EmpireAi",true),mode)
    : string.IsNullOrEmpty(connection) && builder.Environment.IsDevelopment()
    ? Rules.CreateFromMap(RealStarMap.Generate(NewMapSeed()),DateTimeOffset.UtcNow,builder.Configuration.GetValue("EmpireAi",true),builder.Configuration.GetValue("EconomyVersion",0),builder.Configuration.GetValue("CombatVersion",0))
    : Rules.Create(builder.Configuration.GetValue("Seed",42017),DateTimeOffset.UtcNow,builder.Configuration.GetValue("EmpireAi",true),builder.Configuration.GetValue("EconomyVersion",0),builder.Configuration.GetValue("CombatVersion",0));
IGameStore store;
GeneratedCampaigns? generatedCampaigns = null;

if(!string.IsNullOrEmpty(connection))
{
    var pg=new PostgresGameStore(connection,NewGame); await pg.Initialize(); store=pg;
}
else
{
    if(!builder.Environment.IsDevelopment()) throw new InvalidOperationException("PostgreSQL connection required outside Development.");
    store=new FileGameStore(savePath,NewGame);
    generatedCampaigns=new GeneratedCampaigns(Path.Combine(Path.GetDirectoryName(Path.GetFullPath(savePath))!,"generated-campaigns"));
    builder.Services.AddSingleton(generatedCampaigns);
    builder.Services.AddHostedService<GeneratedTurnWorker>();
}
builder.Services.AddSingleton(store);
builder.Services.AddHostedService<TurnWorker>();
AccountAccess? access=null;
if(authMode=="accounts")
{
    IAccountStore accounts;
    if(!string.IsNullOrEmpty(connection)) { var pgAccounts=new PostgresAccountStore(connection); await pgAccounts.Initialize(); accounts=pgAccounts; }
    else accounts=new FileAccountStore(Path.Combine(Path.GetDirectoryName(Path.GetFullPath(savePath))!,"accounts.json"));
    var clanNames=await store.Execute(g=>g.Clans.Select(clan=>clan.Name).ToArray(),false);
    access=new AccountAccess(accounts,builder.Configuration["Owner:SetupKey"],clanNames,builder.Environment.IsDevelopment());
}
// Sign-in, setup and invitation attempts are limited per client address.
var authPermits=builder.Configuration.GetValue("Auth:AttemptsPerMinute",20);
builder.Services.AddRateLimiter(o=>
{
    o.RejectionStatusCode=429;
    o.AddPolicy(AccountAccess.RateLimitPolicy,c=>RateLimitPartition.GetFixedWindowLimiter(c.Connection.RemoteIpAddress?.ToString()??"unknown",
        _=>new FixedWindowRateLimiterOptions{PermitLimit=authPermits,Window=TimeSpan.FromMinutes(1),QueueLimit=0}));
});
// Hosted behind a platform proxy that terminates HTTPS: trust its forwarded scheme and client address.
// Enable only when the app cannot be reached except through that proxy.
var trustProxy=builder.Configuration.GetValue("Proxy:TrustForwardedHeaders",false);
if(trustProxy) builder.Services.Configure<ForwardedHeadersOptions>(o=>
{
    o.ForwardedHeaders=ForwardedHeaders.XForwardedFor|ForwardedHeaders.XForwardedProto;
    o.ForwardLimit=builder.Configuration.GetValue("Proxy:ForwardLimit",1);
    o.KnownIPNetworks.Clear(); o.KnownProxies.Clear();
});
var requireHttps=builder.Configuration.GetValue("Https:Require",authMode=="accounts" && !builder.Environment.IsDevelopment());
builder.Services.AddHttpsRedirection(o=>{o.HttpsPort=443;o.RedirectStatusCode=StatusCodes.Status308PermanentRedirect;});
var app=builder.Build();
if(trustProxy) app.UseForwardedHeaders();
if(requireHttps)
{
    app.UseHsts();
    // Platform health probes usually arrive over plain HTTP from inside the network.
    app.UseWhen(c=>!c.Request.Path.StartsWithSegments("/health"),branch=>branch.UseHttpsRedirection());
}
app.Use(async(ctx,next)=>
{
    ctx.Response.Headers["Cache-Control"]="no-store";
    ctx.Response.Headers["X-Content-Type-Options"]="nosniff";
    ctx.Response.Headers["Content-Security-Policy"]="default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'";
    try
    {
        if(ctx.Request.Path.StartsWithSegments("/api"))
        {
            if(access is not null) { if(!await access.Authorize(ctx)) return; }
            else if(!ctx.Request.Path.Equals("/api/public/state"))
            {
                var token=ctx.Request.Headers.Authorization.ToString();
                var team=Array.FindIndex(keys,k=>CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(token),Encoding.UTF8.GetBytes("Bearer "+k)));
                if(team<0) { ctx.Response.StatusCode=401; return; }
                ctx.Items["team"]=team;
            }
        }
        await next(ctx);
    }
    catch(RuleException ex) { ctx.Response.StatusCode=409; await ctx.Response.WriteAsJsonAsync(new{error=ex.Message}); }
    catch(AccountException ex) { ctx.Response.StatusCode=ex.Status; await ctx.Response.WriteAsJsonAsync(new{error=ex.Message}); }
});
app.UseRateLimiter();
if(access is not null) access.Map(app);
else app.MapGet("/api/public/state",()=>Results.Ok(new{mode="keys"}));
int Team(HttpContext c)=>(int)c.Items["team"]!;
// The signed-in clan, once it is known to be part of this campaign's current season.
int Seat(HttpContext c,Game g)=>Team(c)<g.Clans.Count?Team(c):throw new RuleException("Your clan is not part of this season.");
// A season can only drop a clan that nobody belongs to and nobody is invited to.
async Task RequireEmptyClans(int? clans)
{
    if(access is null || clans is not int count) return;
    var stranded=await access.Store.Execute(book=>book.Accounts.Where(a=>a.Clan>=count).Select(a=>a.DisplayName)
        .Concat(book.Invitations.Where(i=>i.Clan>=count && Accounts.Status(i,DateTimeOffset.UtcNow)=="open").Select(_=>"an open invitation")).ToArray(),false);
    if(stranded.Length>0) throw new RuleException($"Move these to another clan first, because their clan would not be in the season: {string.Join(", ",stranded)}.");
}
async Task RefreshClans(HttpContext c)
{
    if(access is not null && string.IsNullOrEmpty(c.Request.Headers["X-Deepfield-Campaign"].ToString())) access.SetClans(await store.Execute(g=>g.Clans.Select(clan=>clan.Name).ToArray(),false));
}
bool CanAccelerate(HttpContext c)=>LocalTurns.Allowed(localTest,c);
bool CanStartSeason(HttpContext c)=>c.Items["account"] is Account{Owner:true} || (access is null && CanAccelerate(c));
IGameStore CampaignStore(HttpContext c)
{
    var id=c.Request.Headers["X-Deepfield-Campaign"].ToString();
    return string.IsNullOrEmpty(id)?store:generatedCampaigns?.Existing(id) ?? throw new RuleException("Generated campaigns require a local file store.");
}
IResult PreviewStarMap(HttpContext c,StarMapPreviewRequest body)
{
    if(!CanAccelerate(c)) return Results.NotFound();
    if(!body.Real) throw new RuleException("New campaigns use cataloged real star systems. Existing fictional campaigns remain available from their saved files.");
    return Results.Ok(RealStarMap.Generate(body.Seed,body.PlayerCount is 0?2:body.PlayerCount));
}
app.MapGet("/health",()=>Results.Ok(new{status="ok"}));
// Readiness also proves the campaign store (and so the database) answers.
app.MapGet("/health/ready",async()=>Results.Ok(new{status="ok",turn=await store.Execute(g=>g.Turn,false)}));
app.MapGet("/api/campaign",(Delegate)(Func<HttpContext,Task<IResult>>)(async c=>Results.Ok(new{campaign=await CampaignStore(c).Execute(g=>Rules.Observe(g,Seat(c,g)),false),localTest=CanAccelerate(c),seasonControl=CanStartSeason(c)})));
// Starting the next season replaces the map for everyone, so it belongs to the campaign owner
// (or, with clan keys, to a local test session). In accounts mode /api/admin is already owner-only.
app.MapPost("/api/admin/season",async(HttpContext c,NextSeason body)=>
{
    if(!CanStartSeason(c)) return Results.NotFound();
    await RequireEmptyClans(body.Clans);
    var season=await CampaignStore(c).Execute(g=>{Seasons.StartNext(g,body.Season,body.MapSeed??RandomMapSeed(),DateTimeOffset.UtcNow,body.EndEarly,body.Victory,body.Mode,body.IndustrialFocus,body.Clans);return g.Season;});
    await RefreshClans(c);
    return Results.Ok(new{season});
});
app.MapPost("/api/admin/mode",async(HttpContext c,SetMode body)=>
{
    if(!CanStartSeason(c)) return Results.NotFound();
    await RequireEmptyClans(body.Clans);
    var mode=await CampaignStore(c).Execute(g=>{Seasons.SetMode(g,body.Season,body.Mode??"",DateTimeOffset.UtcNow,body.IndustrialFocus,body.Clans);return g.Mode;});
    await RefreshClans(c);
    return Results.Ok(new{mode});
});
// The computer plays a clan only when the campaign owner says so. It never steps in for players who miss a turn.
app.MapPost("/api/admin/clan",async(HttpContext c,SetClanControl body)=>
{
    if(!CanStartSeason(c)) return Results.NotFound();
    return Results.Ok(new{seats=await CampaignStore(c).Execute(g=>{Ai.SetControl(g,body.Team,body.Computer);return g.Clans.Select(clan=>new Seat(clan.Name,clan.Ai)).ToArray();})});
});
app.MapPost("/api/admin/victory",async(HttpContext c,SetVictory body)=>
{
    if(!CanStartSeason(c)) return Results.NotFound();
    if(body.Victory is null) return Results.BadRequest(new{error="A winning condition is required."});
    return Results.Ok(new{victory=await CampaignStore(c).Execute(g=>{Seasons.SetVictory(g,body.Season,body.Victory);return g.Victory;})});
});
app.MapPut("/api/orders",async(HttpContext c,Submission body)=>Results.Ok(new{revision=await CampaignStore(c).Execute(g=>
{
    if(g.Clans[Seat(c,g)].Ai) throw new RuleException("This clan is played by the computer. The campaign owner can hand it back to its players.");
    return Rules.Submit(g,Team(c),body,DateTimeOffset.UtcNow);
})}));
// Alliances, in a season with three or four clans: offer (or accept an offer), decline (or withdraw), and end with a turn's notice.
app.MapPost("/api/alliances",async(HttpContext c,AllianceRequest body)=>Results.Ok(new{campaign=await CampaignStore(c).Execute(g=>
{
    var team=Seat(c,g);
    if(g.Clans[team].Ai) throw new RuleException("This clan is played by the computer. The campaign owner can hand it back to its players.");
    switch(body.Action)
    {
        case "offer": Alliances.Offer(g,team,body.Clan); break;
        case "decline": Alliances.Decline(g,team,body.Clan); break;
        case "end": Alliances.End(g,team,body.Clan); break;
        default: throw new RuleException("Choose offer, decline or end.");
    }
    return Rules.Observe(g,team);
})}));
app.MapPost("/api/messages",async(HttpContext c,BoardPost body)=>Results.Ok(await CampaignStore(c).Execute(g=>
{
    // With personal accounts the author is the signed-in player, never a name typed by the client.
    var author=c.Items["account"] is Account signedIn?signedIn.DisplayName:body.Author;
    if(string.IsNullOrWhiteSpace(body.Id) || body.Id.Length>80 || string.IsNullOrWhiteSpace(author) || author.Length>40 || string.IsNullOrWhiteSpace(body.Text) || body.Text.Length>2000) throw new RuleException("Provide ID, author (1–40) and message (1–2000 characters).");
    var messages=g.Clans[Seat(c,g)].Messages; var prior=messages.Find(m=>m.Id==body.Id);
    if(prior!=null) { if(prior.Text!=body.Text || prior.Author!=author) throw new RuleException("Message ID already used."); return prior; }
    var message=new Message(body.Id,author,body.Text,DateTimeOffset.UtcNow); messages.Add(message);
    if(messages.Count>200) messages.RemoveAt(0); return message;
})));
app.MapPost("/api/local/advance",async(HttpContext c,Advance body)=>
{
    if(!CanAccelerate(c)) return Results.NotFound();
    return Results.Ok(await CampaignStore(c).Execute(g=>LocalTurns.Resolve(g,body.Turn,DateTimeOffset.UtcNow)));
});
app.MapPost("/api/local/star-map/preview",PreviewStarMap);
app.MapPost("/api/local/campaigns",async(HttpContext c,StartGeneratedCampaign body)=>
{
    if(!CanAccelerate(c) || generatedCampaigns is null) return Results.NotFound();
    if(body.Preview is null || body.GeneratorVersion!=StarMapGenerator.CurrentVersion) throw new RuleException("Preview a current star map before starting a campaign.");
    if(!body.Preview.Real) throw new RuleException("New campaigns use cataloged real star systems. Existing fictional campaigns remain available from their saved files.");
    var map=RealStarMap.Generate(body.Preview.Seed,body.Preview.PlayerCount is 0?2:body.Preview.PlayerCount);
    if(Team(c)>=map.Settings.PlayerCount) throw new RuleException("Your clan would not be part of that campaign.");
    var game=await generatedCampaigns.Start(body.Id,map,builder.Configuration.GetValue("EmpireAi",true),builder.Configuration.GetValue("EconomyVersion",0),body.CombatVersion??builder.Configuration.GetValue("CombatVersion",0),body.LogisticsVersion,body.IndustrialFocus,body.Mode is null?null:Modes.Validated(body.Mode));
    return Results.Ok(new {id=body.Id,campaign=Rules.Observe(game,Team(c))});
});
app.UseDefaultFiles(); app.UseStaticFiles();
app.MapFallbackToFile("index.html");
app.Run();
public record BoardPost(string Id,string? Author,string Text);
public record Advance(int Turn);
public record NextSeason(int Season,bool EndEarly=false,int? MapSeed=null,VictoryRule? Victory=null,string? Mode=null,int[]? IndustrialFocus=null,int? Clans=null);
public record SetMode(int Season,string? Mode,int[]? IndustrialFocus=null,int? Clans=null);
public record AllianceRequest(string? Action,int Clan);
public record SetVictory(int Season,VictoryRule? Victory);
public record SetClanControl(int Team,bool Computer);
public record StarMapPreviewRequest(int Seed,int SystemCount,int Width,int Height,int MinimumSeparation,int NearestNeighborLinks,int PlayerCount,bool Real=false);
public record StartGeneratedCampaign(string Id,int GeneratorVersion,StarMapPreviewRequest? Preview,int LogisticsVersion=0,int[]? IndustrialFocus=null,int? CombatVersion=null,string? Mode=null);
