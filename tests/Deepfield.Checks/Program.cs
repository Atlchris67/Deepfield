if (args.Contains("--seasons")) { await SeasonChecks.Run(); return; }
if (args.Contains("--accounts")) { await AccountChecks.Run(); return; }
if (args.Contains("--habitability")) { HabitabilityChecks.Run(); return; }
if (args.Contains("--recon")) { await ReconChecks.Run(); return; }
if (args.Contains("--ship-design")) { ShipDesignChecks.Run(); return; }
if (args.Contains("--typed")) { await TypedFleetChecks.Run(); return; }
await Checks.Run();
await ReconChecks.Run();
HabitabilityChecks.Run();
EconomyChecks.Run();
ShipDesignChecks.Run();
await TypedFleetChecks.Run();
PreviewStorageChecks.Run();
await LocalTurnChecks.Run();
PlanetChecks.Run();
StarMapChecks.Run();
await GeneratedCampaignChecks.Run();
await RealCampaignChecks.Run();
await AccountChecks.Run();
await SeasonChecks.Run();
