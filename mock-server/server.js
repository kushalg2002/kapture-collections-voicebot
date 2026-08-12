const express = require("express");
require("dotenv").config();

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;

// --------------------------------------------------
// Normalize account IDs
// --------------------------------------------------

function normalizeAccountId(value) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
}

// --------------------------------------------------
// Mock customer data
// --------------------------------------------------

const customer = {
  account_id: "ACC88392",
  name: "Rahul Sharma",
  loan_type: "Personal Loan",
  overdue_amount: 8499,
  days_past_due: 12,
  verification_codes: ["1234", "1995"],
};

// --------------------------------------------------
// Health check
// --------------------------------------------------

app.get("/", (req, res) => {
  res.json({
    success: true,
    service: "Kapture Finance Collections Mock Server",
    status: "running",
  });
});

// --------------------------------------------------
// Vapi Webhook
// --------------------------------------------------

app.post("/webhook", (req, res) => {
  try {
    console.log("\n========== VAPI WEBHOOK ==========");
    console.log(JSON.stringify(req.body, null, 2));

    const message = req.body?.message;

    // ----------------------------------------------
    // Handle Vapi tool calls
    // ----------------------------------------------

    if (message?.type === "tool-calls") {
      const toolCall = message.toolCalls?.[0];

      if (!toolCall) {
        return res.status(400).json({
          success: false,
          message: "No tool call found",
        });
      }

      const toolName = toolCall.function?.name;
      const args = toolCall.function?.arguments || {};
      const toolCallId = toolCall.id;

      console.log("Tool:", toolName);
      console.log("Arguments:", args);

      let result;

      const accountId = normalizeAccountId(args.account_id);
      const expectedAccountId = normalizeAccountId(
        customer.account_id
      );

      // --------------------------------------------
      // TOOL 1: verify_customer
      // --------------------------------------------

      switch (toolName) {
        case "verify_customer": {
          const verificationCode = String(
            args.verification_code || ""
          ).trim();

          const customerAccountId =
            normalizeAccountId(args.account_id);

          const expectedCustomerAccountId =
            normalizeAccountId(customer.account_id);

          console.log(
            "Normalized Account ID:",
            customerAccountId
          );

          console.log(
            "Expected Account ID:",
            expectedCustomerAccountId
          );

          if (
            customerAccountId !==
            expectedCustomerAccountId
          ) {
            result = {
              verified: false,
              message: "Account could not be verified.",
            };
            break;
          }

          if (
            customer.verification_codes.includes(
              verificationCode
            )
          ) {
            result = {
              verified: true,
              customer_name: customer.name,
              loan_type: customer.loan_type,
              overdue_amount: customer.overdue_amount,
              days_past_due: customer.days_past_due,
              message: "Identity verified successfully.",
            };
          } else {
            result = {
              verified: false,
              message:
                "Verification failed. Incorrect verification information.",
            };
          }

          break;
        }

        // --------------------------------------------
        // TOOL 2: log_promise_to_pay
        // --------------------------------------------

        case "log_promise_to_pay": {
          const customerAccountId =
            normalizeAccountId(args.account_id);

          const ptpDate = args.ptp_date;
          const amount = Number(args.amount);

          if (
            customerAccountId !==
            expectedAccountId
          ) {
            result = {
              success: false,
              message: "Invalid account ID.",
            };
            break;
          }

          if (!ptpDate || !amount || amount <= 0) {
            result = {
              success: false,
              message:
                "PTP date and valid payment amount are required.",
            };
            break;
          }

          const ptpId =
            "PTP-" +
            Math.floor(1000 + Math.random() * 9000);

          result = {
            success: true,
            ptp_id: ptpId,
            confirmed_date: ptpDate,
            amount: amount,
            message:
              "Promise to pay recorded successfully.",
          };

          break;
        }

        // --------------------------------------------
        // TOOL 3: send_payment_link
        // --------------------------------------------

        case "send_payment_link": {
          const customerAccountId =
            normalizeAccountId(args.account_id);

          const channel = String(
            args.channel || ""
          ).toUpperCase();

          if (
            customerAccountId !==
            expectedAccountId
          ) {
            result = {
              success: false,
              message: "Invalid account ID.",
            };
            break;
          }

          if (
            !["SMS", "WHATSAPP", "BOTH"].includes(
              channel
            )
          ) {
            result = {
              success: false,
              message:
                "Channel must be SMS, WhatsApp, or BOTH.",
            };
            break;
          }

          result = {
            success: true,
            link_sent: true,
            channel: channel,
            message:
              `Payment link sent successfully via ${channel} ` +
              "to the registered mobile number.",
          };

          break;
        }

        // --------------------------------------------
        // TOOL 4: escalate_to_agent
        // --------------------------------------------

        case "escalate_to_agent": {
          const reason =
            args.reason || "GENERAL";

          result = {
            success: true,
            escalated: true,
            reason: reason,
            escalation_id:
              "ESC-" +
              Math.floor(1000 + Math.random() * 9000),
            message:
              "The customer has been successfully escalated to a human agent.",
          };

          break;
        }

        // --------------------------------------------
        // TOOL 5: mark_disposition
        // --------------------------------------------

        case "mark_disposition": {
          const customerAccountId =
            normalizeAccountId(args.account_id);

          const status = args.status;
          const notes = args.notes || "";

          if (
            customerAccountId !==
            expectedAccountId
          ) {
            result = {
              success: false,
              message: "Invalid account ID.",
            };
            break;
          }

          result = {
            success: true,
            disposition_logged: status,
            notes: notes,
            timestamp: new Date().toISOString(),
            message:
              "Call disposition logged successfully.",
          };

          break;
        }

        // --------------------------------------------
        // Unknown tool
        // --------------------------------------------

        default: {
          result = {
            success: false,
            message: `Unknown tool: ${toolName}`,
          };
        }
      }

      console.log("Result:", result);
      console.log("================================\n");

      // --------------------------------------------
      // Return result to Vapi
      // --------------------------------------------

      return res.status(200).json({
        results: [
          {
            toolCallId: toolCallId,
            result: JSON.stringify(result),
          },
        ],
      });
    }

    // ----------------------------------------------
    // Handle other Vapi events
    // ----------------------------------------------

    return res.status(200).json({
      success: true,
      status: "acknowledged",
    });

  } catch (error) {
    console.error("Webhook error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// --------------------------------------------------
// Start server
// --------------------------------------------------

app.listen(PORT, () => {
  console.log(
    `Kapture Mock Collections Webhook Server running on port ${PORT}`
  );
});