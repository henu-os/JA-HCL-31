# Multi-stage Docker build for JEEVIKA ERP ASP.NET Core 8 Web API & Frontend
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy project files and restore dependencies
COPY Backend/JeevikaERP.csproj Backend/
RUN dotnet restore Backend/JeevikaERP.csproj

# Copy complete repository
COPY . .

# Build and publish in Release mode
WORKDIR /src/Backend
RUN dotnet publish JeevikaERP.csproj -c Release -o /app/publish --no-restore

# Runtime Image
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

# Install native dependencies (for fonts, graphics, libgdiplus if needed)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libgdiplus \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy published backend binaries
COPY --from=build /app/publish .

# Copy web frontend assets for static file serving
COPY --from=build /src/modules ./modules
COPY --from=build /src/assets ./assets
COPY --from=build /src/js ./js
COPY --from=build /src/config.js ./config.js
COPY --from=build /src/workspace.html ./workspace.html
COPY --from=build /src/login.html ./login.html
COPY --from=build /src/setup.html ./setup.html
COPY --from=build /src/favicon.svg ./favicon.svg
COPY --from=build /src/Database ./Database

# Environment variables
ENV ASPNETCORE_URLS=http://0.0.0.0:5002 \
    ASPNETCORE_ENVIRONMENT=Production \
    DOTNET_RUNNING_IN_CONTAINER=true

# Expose HTTP API & UI port
EXPOSE 5002

# Health check
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:5002/health || exit 1

ENTRYPOINT ["dotnet", "JeevikaERP.dll"]
