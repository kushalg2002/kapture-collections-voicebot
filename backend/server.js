const express = require("express");
const cors = require("cors");
require("dotenv").config();

const sql = require("./db");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ==================================================
// CONFIGURATION
// ==================================================

const EXPECTED_ACCOUNT_ID = "ACC88392";

// ==================================================
// HELPERS
// ==================================================

function normalizeAccountId(value) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
}

function parseArguments(argumentsValue) {
  if (!argumentsValue) {
    return {};
  }

  if (typeof argumentsValue === "object") {
    return argumentsValue;
  }

  try {
    return JSON.parse(argumentsValue);
  } catch (error) {
    console.error("Could not parse tool arguments:", argumentsValue);
    return {};
  }
}

function generateId(prefix) {
  return (
    prefix +
    "-" +
    Date.now() +
    "-" +
    Math.floor(1000 + Math.random() * 9000)
  );
}

function isValidAccount(accountId) {
  return (
    normalizeAccountId(accountId) ===
    normalizeAccountId(EXPECTED_ACCOUNT_ID)
  );
}

// ==================================================
// HEALTH CHECK
// ==================================================

app.get("/", async (req, res) => {
  try {
    const result = await sql`
      SELECT NOW() AS current_time
    `;

    res.json({
      success: true,
      service: "Kapture Finance Collections API",
      status: "running",
      database: "connected",
      database_time: result[0].current_time,
    });
  } catch (error) {
    console.error("Database error:", error);

    res.status(500).json({
      success: false,
      service: "Kapture Finance Collections API",
      status: "running",
      database: "disconnected",
      error: error.message,
    });
  }
});

// ==================================================
// VAPI WEBHOOK
// ==================================================

app.post("/webhook", async (req, res) => {
  try {
    console.log("\n========================================");
    console.log("VAPI WEBHOOK RECEIVED");
    console.log("========================================");
    console.log(JSON.stringify(req.body, null, 2));

    const message = req.body?.message;

    // ==================================================
    // VAPI TOOL CALLS
    // ==================================================

    if (message?.type === "tool-calls") {
      const toolCall = message.toolCalls?.[0];

      if (!toolCall) {
        return res.status(400).json({
          success: false,
          message: "No tool call found.",
        });
      }

      const toolName = toolCall.function?.name;
      const args = parseArguments(toolCall.function?.arguments);
      const toolCallId = toolCall.id;

      console.log("Tool:", toolName);
      console.log("Arguments:", args);

      let result;

      // ==================================================
      // TOOL 1: VERIFY CUSTOMER
      // ==================================================

      if (toolName === "verify_customer") {
        const accountId = normalizeAccountId(args.account_id);

        const verificationCode = String(
          args.verification_code || ""
        ).replace(/\s+/g, "");

        console.log("Normalized account:", accountId);
        console.log("Verification code:", verificationCode);

        if (!accountId || !verificationCode) {
          result = {
            verified: false,
            message:
              "Account ID and verification code are required.",
          };
        } else {
          const customers = await sql`
            SELECT
              account_id,
              name,
              loan_type,
              overdue_amount,
              days_past_due,
              verification_codes
            FROM customers
            WHERE account_id = ${accountId}
            LIMIT 1
          `;

          if (customers.length === 0) {
            result = {
              verified: false,
              message: "Account could not be verified.",
            };
          } else {
            const customer = customers[0];

            const codes = Array.isArray(customer.verification_codes)
              ? customer.verification_codes.map((code) =>
                  String(code).replace(/\s+/g, "")
                )
              : [];

            if (!codes.includes(verificationCode)) {
              result = {
                verified: false,
                message:
                  "Verification failed. Incorrect verification information.",
              };
            } else {
              result = {
                verified: true,
                customer_name: customer.name,
                account_id: customer.account_id,
                loan_type: customer.loan_type,
                overdue_amount: Number(customer.overdue_amount),
                days_past_due: customer.days_past_due,
                message:
                  "Identity verified successfully.",
              };
            }
          }
        }
      }

      // ==================================================
      // TOOL 2: LOG PROMISE TO PAY
      // ==================================================

      else if (toolName === "log_promise_to_pay") {
        const accountId = normalizeAccountId(args.account_id);

        const ptpDate = String(args.ptp_date || "").trim();

        const amount = Number(args.amount);

        if (!isValidAccount(accountId)) {
          result = {
            success: false,
            message: "Invalid account ID.",
          };
        } else if (!ptpDate) {
          result = {
            success: false,
            message: "Payment date is required.",
          };
        } else if (!Number.isFinite(amount) || amount <= 0) {
          result = {
            success: false,
            message: "A valid payment amount is required.",
          };
        } else {
          // Check customer exists
          const customers = await sql`
            SELECT account_id
            FROM customers
            WHERE account_id = ${accountId}
            LIMIT 1
          `;

          if (customers.length === 0) {
            result = {
              success: false,
              message: "Customer account was not found.",
            };
          } else {
            const ptpId = generateId("PTP");

            await sql`
              INSERT INTO promise_to_pay (
                account_id,
                ptp_date,
                amount,
                ptp_id,
                status
              )
              VALUES (
                ${accountId},
                ${ptpDate},
                ${amount},
                ${ptpId},
                'PROMISED'
              )
            `;

            result = {
              success: true,
              ptp_id: ptpId,
              confirmed_date: ptpDate,
              amount: amount,
              message:
                "Promise to pay recorded successfully.",
            };
          }
        }
      }

      // ==================================================
      // TOOL 3: SEND PAYMENT LINK
      // ==================================================

      else if (toolName === "send_payment_link") {
        const accountId = normalizeAccountId(args.account_id);

        const channel = String(
          args.channel || ""
        ).trim().toUpperCase();

        if (!isValidAccount(accountId)) {
          result = {
            success: false,
            message: "Invalid account ID.",
          };
        } else if (
          !["SMS", "WHATSAPP", "BOTH"].includes(channel)
        ) {
          result = {
            success: false,
            message:
              "Channel must be SMS, WHATSAPP, or BOTH.",
          };
        } else {
          const customers = await sql`
            SELECT account_id
            FROM customers
            WHERE account_id = ${accountId}
            LIMIT 1
          `;

          if (customers.length === 0) {
            result = {
              success: false,
              message: "Customer account was not found.",
            };
          } else {
            await sql`
              INSERT INTO payment_links (
                account_id,
                channel,
                link_sent
              )
              VALUES (
                ${accountId},
                ${channel},
                true
              )
            `;

            result = {
              success: true,
              link_sent: true,
              channel: channel,
              message:
                `Payment link sent successfully via ${channel} to the registered mobile number.`,
            };
          }
        }
      }

      // ==================================================
      // TOOL 4: ESCALATE TO AGENT
      // ==================================================

      else if (toolName === "escalate_to_agent") {
        const accountId = normalizeAccountId(args.account_id);

        const reason = String(
          args.reason || "GENERAL"
        ).trim();

        if (!isValidAccount(accountId)) {
          result = {
            success: false,
            message: "Invalid account ID.",
          };
        } else {
          const escalationId = generateId("ESC");

          await sql`
            INSERT INTO escalations (
              account_id,
              escalation_id,
              reason,
              status
            )
            VALUES (
              ${accountId},
              ${escalationId},
              ${reason},
              'OPEN'
            )
          `;

          result = {
            success: true,
            escalated: true,
            escalation_id: escalationId,
            reason: reason,
            message:
              "The customer has been successfully escalated to a human agent.",
          };
        }
      }

      // ==================================================
      // TOOL 5: MARK DISPOSITION
      // ==================================================

      else if (toolName === "mark_disposition") {
        const accountId = normalizeAccountId(args.account_id);

        const status = String(
          args.status || ""
        ).trim();

        const notes = String(
          args.notes || ""
        ).trim();

        if (!isValidAccount(accountId)) {
          result = {
            success: false,
            message: "Invalid account ID.",
          };
        } else if (!status) {
          result = {
            success: false,
            message: "Disposition status is required.",
          };
        } else {
          await sql`
            INSERT INTO dispositions (
              account_id,
              status,
              notes
            )
            VALUES (
              ${accountId},
              ${status},
              ${notes}
            )
          `;

          result = {
            success: true,
            disposition_logged: status,
            notes: notes,
            message:
              "Call disposition logged successfully.",
          };
        }
      }

      // ==================================================
      // UNKNOWN TOOL
      // ==================================================

      else {
        result = {
          success: false,
          message: `Unknown tool: ${toolName}`,
        };
      }

      console.log("Tool result:", result);
      console.log("========================================\n");

      return res.status(200).json({
        results: [
          {
            toolCallId: toolCallId,
            result: JSON.stringify(result),
          },
        ],
      });
    }

    // ==================================================
    // OTHER VAPI EVENTS
    // ==================================================

    return res.status(200).json({
      success: true,
      status: "acknowledged",
    });
  } catch (error) {
    console.error("\nVAPI WEBHOOK ERROR:");
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
});

// ==================================================
// START SERVER
// ==================================================

app.listen(PORT, () => {
  console.log(
    `Kapture Finance API running on port ${PORT}`
  );
});