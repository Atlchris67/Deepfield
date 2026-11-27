# Provider-neutral image for hosted Deepfield. Build from the repository root:
#   docker build -t deepfield .
# CI builds this image and starts it against a throwaway PostgreSQL on every pull request (.github/workflows/ci.yml).
# It is not pushed anywhere, and it has not been built on the development machine (no Docker there).

FROM node:22-bookworm-slim AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build -- --outDir /out/wwwroot --emptyOutDir

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY src/ src/
# The rules engine embeds the real-star catalogue that the web app also uses.
COPY web/src/realSystems.json web/src/realSystems.json
RUN dotnet publish src/Deepfield.Api -c Release -o /app -p:BuildDeepfieldFrontend=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app ./
COPY --from=web /out/wwwroot ./wwwroot
# The platform's proxy terminates HTTPS and forwards plain HTTP to this port.
ENV ASPNETCORE_ENVIRONMENT=Production \
    ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
USER $APP_UID
ENTRYPOINT ["dotnet", "Deepfield.Api.dll"]
