// api/mcp.js - Vercel serverless function wrapper
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import axios from "axios";
import https from "https{import_issue_if_any}"; // This will be automatically corrected by the tool

// --- Main Server Class ---
class Magento2MCPServer {
  constructor() {
    console.log("👷 Initializing Magento2MCPServer...");

    this.baseUrl = process.env.MAGENTO_BASE_URL;
    this.apiToken = process.env.MAGENTO_API_TOKEN;

    if (!this.baseUrl || !this.apiToken) {
      throw new Error("Missing required environment variables: MAGENTO_BASE_URL and MAGENTO_API_TOKEN must be set.");
    }
    
    // This is the server definition. It maps tool names to their implementation.
    const toolImplementations = {
      get_product_by_sku: {
        description: "Get detailed information about a product by its SKU",
        inputSchema: { type: "object", properties: { sku: { type: "string" } }, required: ["sku"] },
        execute: async ({ sku }) => this.getProductBySku(sku),
      },
      get_order_status: {
        description: "Get order status by order ID or increment ID",
        inputSchema: { type: "object", properties: { orderId: { type: "string" } }, required: ["orderId"] },
        execute: async ({ orderId }) => this.getOrderStatus(orderId),
      },
      search_products: {
        description: "Search for products using Magento search criteria",
        inputSchema: { type: "object", properties: { searchCriteria: { type: "object" } }, required: ["searchCriteria"] },
        execute: async ({ searchCriteria }) => this.searchProducts(searchCriteria),
      },
      get_customer_ordered_products_by_email: {
        description: "Get all ordered products for a customer by email address",
        inputSchema: { type: "object", properties: { email: { type: "string" } }, required: ["email"] },
        execute: async ({ email }) => this.getCustomerOrderedProductsByEmail(email),
      },
      get_order_count: {
        description: "Get the number of orders for a given date range",
        inputSchema: { type: "object", properties: { startDate: { type: "string" }, endDate: { type: "string" } }, required: ["startDate", "endDate"] },
        execute: async ({ startDate, endDate }) => this.getOrderCount(startDate, endDate),
      },
      get_revenue: {
        description: "Get the total revenue for a given date range",
        inputSchema: { type: "object", properties: { startDate: { type: "string" }, endDate: { type: "string" } }, required: ["startDate", "endDate"] },
        execute: async ({ startDate, endDate }) => this.getRevenue(startDate, endDate),
      },
    };

    // THE CRITICAL FIX IS HERE:
    // The SDK expects the capabilities to be structured by the method they serve.
    // The entire toolset must be provided under the "tools/call" method.
    this.server = new Server(
      {
        name: "magento2-mcp-server-vercel",
        version: "1.0.2", // Incremented version
      },
      {
        capabilities: {
          "tools/call": { // This key must match the MCP method name
            tools: toolImplementations,
          },
        },
      }
    );
    console.log("✅ MCP Server initialized correctly for 'tools/call' method.");
  }

  // --- Core API and Tool Logic Methods ---
  // (These methods are unchanged and correct)
  async callMagentoApi(endpoint, method = "GET", data = null) {
    const url = `${this.baseUrl}/${endpoint}`;
    const httpsAgent = new https.Agent({ rejectUnauthorized: false });
    const config = { method, url, headers: { Authorization: `Bearer ${this.apiToken}`, "Content-Type": "application/json" }, httpsAgent, data };
    try {
      const response = await axios(config);
      return response.data;
    } catch (error) {
      console.error(`Magento API call to ${url} failed:`, error.response?.data || error.message);
      throw new Error(`Magento API Error: ${error.message}`);
    }
  }

  async getProductBySku(sku) { /* ...unchanged... */ }
  async getOrderStatus(orderId) { /* ...unchanged... */ }
  // ... and so on for all your other tool methods. They are correct.
}

// --- Vercel Handler Logic ---
// (This part is also correct and unchanged)
const mcpServer = new Magento2MCPServer();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-MCP-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return res.status(200).json({ status: 'online' });

  if (req.method === 'POST') {
    try {
      const mcpRequest = req.body;
      console.log("Received MCP Request:", JSON.stringify(mcpRequest, null, 2));
      const mcpResponse = await mcpServer.server.request(mcpRequest);
      console.log("Sending MCP Response:", JSON.stringify(mcpResponse, null, 2));
      return res.status(200).json(mcpResponse);
    } catch (error) {
      console.error("Error processing MCP request:", error);
      return res.status(500).json({ error: 'An internal error occurred', message: error.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}