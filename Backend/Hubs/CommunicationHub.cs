// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — CommunicationHub.cs
// ASP.NET Core SignalR Real-Time Hub for WhatsApp & Email CRM
// ═══════════════════════════════════════════════════════════

using Microsoft.AspNetCore.SignalR;

namespace JeevikaERP.Hubs
{
    public class CommunicationHub : Hub
    {
        public async Task JoinSociety(int societyId)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, $"society_{societyId}");
        }

        public async Task LeaveSociety(int societyId)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"society_{societyId}");
        }

        public async Task JoinConversation(int conversationId)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, $"conv_{conversationId}");
        }

        public async Task LeaveConversation(int conversationId)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"conv_{conversationId}");
        }

        public override async Task OnConnectedAsync()
        {
            // By default join society 1 group (or dynamically based on client handshake)
            await Groups.AddToGroupAsync(Context.ConnectionId, "society_1");
            await base.OnConnectedAsync();
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            await base.OnDisconnectedAsync(exception);
        }
    }
}
