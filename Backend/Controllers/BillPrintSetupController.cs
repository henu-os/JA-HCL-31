// ═══════════════════════════════════════════════════════════
// JEEVIKA ERP v2 — BillPrintSetupController
// Endpoints for managing Bill Print Layout settings
// ═══════════════════════════════════════════════════════════

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JeevikaERP.Controllers
{
    [ApiController]
    [Route("api/bill-print-setup")]
    [AllowAnonymous]
    public class BillPrintSetupController : ControllerBase
    {
        private static object? _currentConfig = null;

        [HttpGet]
        public IActionResult GetConfig()
        {
            if (_currentConfig != null)
                return Ok(_currentConfig);

            return Ok(new
            {
                format = "A4-Portrait",
                heading = "DEFAULT BILL HEADER",
                bldg = true,
                nonocc = true,
                arrears = true,
                receipt = true,
                blankhead = false,
                qr = "none",
                sign = "secretary"
            });
        }

        [HttpPost]
        public IActionResult SaveConfig([FromBody] object payload)
        {
            _currentConfig = payload;
            return Ok(new { success = true, message = "Bill print layout configuration saved." });
        }
    }
}
