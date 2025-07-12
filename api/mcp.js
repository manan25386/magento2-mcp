// api/mcp.js - Vercel serverless function wrapper
import axios from "axios";
import https from "https";

// --- Main Server Class (Holds our logic, but no MCP SDK Server) ---
class Magento2MCPServer {
  constructor() {
    console.log("👷 Initializing Magento2MCPServer Logic...");
    this.baseUrl = process.env.MAGENTO_BASE_URL;
    this.apiToken = process.env.MAGENTO_API_TOKEN;
    if (!this.baseUrl || !this.apiToken) {
      throw new Error("Missing required environment variables.");
    }
  }

  // --- Tool Method Router ---
  // This method replaces the SDK's broken router.
  async callTool(toolName, args) {
    console.log(`Manually calling tool: ${toolName}`, args);
    switch (toolName) {
      case "get_product_by_sku":
        return await this.getProductBySku(args.sku);
      case "get_order_status":
        return await this.getOrderStatus(args.orderId);
      case "search_products":
        return await this.searchProducts(args.searchCriteria);
      case "get_customer_ordered_products_by_email":
        return await this.getCustomerOrderedProductsByEmail(args.email);
      case "get_order_count":
        return await this.getOrderCount(args.startDate, args.endDate);
      case "get_revenue":
        return await this.getRevenue(args.startDate, args.endDate);
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  // --- Tool Listing Method ---
  listTools() {
    return {
      tools: [
        { name: "get_product_by_sku", description: "Get detailed info for a product SKU." },
        { name: "get_order_status", description: "Get status for an order ID." },
        // ... add other descriptions if needed
      ]
    };
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
  async getOrderStatus(orderId) {
    try {
        const order = await this.callMagentoApi(`orders/${orderId}`);
        return { content: [{ type: "text", text: `Status for order ${order.increment_id}: ${order.status}` }] };
    } catch (error) {
        console.log(`Order ${orderId} not found by entity_id, trying increment_id...`);
        const searchResult = await this.callMagentoApi(`orders?searchCriteria[filterGroups][0][filters][0][field]=increment_id&searchCriteria[filterGroups][0][filters][0][value]=${orderId}&searchCriteria[filterGroups][0][filters][0][conditionType]=eq`);
        if (searchResult.items && searchResult.items.length > 0) {
            const order = searchResult.items[0];
            return { content: [{ type: "text", text: `Status for order ${order.increment_id}: ${order.status}` }] };
        }
        throw new Error(`Order not found with ID: ${orderId}`);
    }
  }
  // ... rest of your tool methods are unchanged ...
}

// --- Vercel Handler Logic ---
const mcpLogic = new Magento2MCPServer();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return res.status(200).json({ status: 'online' });

  if (req.method === 'POST') {
    let mcpResponse;
    try {
      const mcpRequest = req.body;
      console.log("Received MCP Request:", JSON.stringify(mcpRequest, null, 2));

      let result;
      // Manually handle the methods, bypassing the SDK server
      if (mcpRequest.method === 'tools/call') {
        const { name, arguments: args } = mcpRequest.params;
        result = await mcpLogic.callTool(name, args);
      } else if (mcpRequest.method === 'tools/list') {
        result = mcpLogic.listTools();
      } else {
        throw new Error(`Unsupported MCP method: ${mcpRequest.method}`);
      }

      // Manually build the successful MCP response
      mcpResponse = {
        mcp_version: "1.0",
        request_id: mcpRequest.request_id || `req-${Date.now()}`,
        result: result,
      };

      console.log("Sending MCP Response:", JSON.stringify(mcpResponse, null, 2));
      return res.status(200).json(mcpResponse);

    } catch (error) {
      console.error("Error processing MCP request:", error);
      // Manually build the error MCP response
      mcpResponse = {
        mcp_version: "1.0",
        error: {
          code: -32603, // Internal error
          message: error.message,
        }
      };
      return res.status(500).json(mcpResponse);
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}