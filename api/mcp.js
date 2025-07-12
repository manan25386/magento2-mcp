// api/mcp.js - Vercel serverless function wrapper
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import axios from "axios";
import https from "https"; // <<< THIS LINE IS NOW CORRECTED

// --- Main Server Class ---
class Magento2MCPServer {
  constructor() {
    console.log("👷 Initializing Magento2MCPServer...");

    this.baseUrl = process.env.MAGENTO_BASE_URL;
    this.apiToken = process.env.MAGENTO_API_TOKEN;

    if (!this.baseUrl || !this.apiToken) {
      throw new Error("Missing required environment variables: MAGENTO_BASE_URL and MAGENTO_API_TOKEN must be set.");
    }
    
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

    this.server = new Server(
      {
        name: "magento2-mcp-server-vercel",
        version: "1.0.2",
      },
      {
        capabilities: {
          "tools/call": { 
            tools: toolImplementations,
          },
        },
      }
    );
    console.log("✅ MCP Server initialized correctly for 'tools/call' method.");
  }

  // --- Core API and Tool Logic Methods ---
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

  async getProductBySku(sku) {
    const product = await this.callMagentoApi(`products/${encodeURIComponent(sku)}`);
    return { content: [{ type: "text", text: JSON.stringify(product, null, 2) }] };
  }

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

  async searchProducts(searchCriteria) {
    const queryParams = new URLSearchParams();
    if (searchCriteria.filterGroups) {
      searchCriteria.filterGroups.forEach((group, groupIndex) => {
        group.filters.forEach((filter, filterIndex) => {
          queryParams.append(`searchCriteria[filterGroups][${groupIndex}][filters][${filterIndex}][field]`, filter.field);
          queryParams.append(`searchCriteria[filterGroups][${groupIndex}][filters][${filterIndex}][value]`, filter.value);
          queryParams.append(`searchCriteria[filterGroups][${groupIndex}][filters][${filterIndex}][conditionType]`, filter.conditionType || 'like');
        });
      });
    }
    const products = await this.callMagentoApi(`products?${queryParams.toString()}`);
    return { content: [{ type: "text", text: JSON.stringify(products, null, 2) }] };
  }
  
  async getCustomerOrderedProductsByEmail(email) {
      const customerResult = await this.callMagentoApi(`customers/search?searchCriteria[filterGroups][0][filters][0][field]=email&searchCriteria[filterGroups][0][filters][0][value]=${email}&searchCriteria[filterGroups][0][filters][0][conditionType]=eq`);
      if (!customerResult.items || customerResult.items.length === 0) throw new Error(`Customer not found with email: ${email}`);
      const customer = customerResult.items[0];
      const ordersResult = await this.callMagentoApi(`orders?searchCriteria[filterGroups][0][filters][0][field]=customer_id&searchCriteria[filterGroups][0][filters][0][value]=${customer.id}&searchCriteria[filterGroups][0][filters][0][conditionType]=eq`);
      return { content: [{ type: "text", text: JSON.stringify({ customer, orders: ordersResult.items }, null, 2) }] };
  }

  async getOrderCount(startDate, endDate) {
      const searchResult = await this.callMagentoApi(`orders?searchCriteria[filterGroups][0][filters][0][field]=created_at&searchCriteria[filterGroups][0][filters][0][value]=${startDate}&searchCriteria[filterGroups][0][filters][0][conditionType]=gteq&searchCriteria[filterGroups][0][filters][1][field]=created_at&searchCriteria[filterGroups][0][filters][1][value]=${endDate}&searchCriteria[filterGroups][0][filters][1][conditionType]=lteq`);
      return { content: [{ type: "text", text: `Order count from ${startDate} to ${endDate}: ${searchResult.total_count}` }] };
  }

  async getRevenue(startDate, endDate) {
      const searchResult = await this.callMagentoApi(`orders?searchCriteria[filterGroups][0][filters][0][field]=created_at&searchCriteria[filterGroups][0][filters][0][value]=${startDate}&searchCriteria[filterGroups][0][filters][0][conditionType]=gteq&searchCriteria[filterGroups][0][filters][1][field]=created_at&searchCriteria[filterGroups][0][filters][1][value]=${endDate}&searchCriteria[filterGroups][0][filters][1][conditionType]=lteq`);
      const totalRevenue = searchResult.items.reduce((sum, order) => sum + parseFloat(order.grand_total || 0), 0);
      return { content: [{ type: "text", text: `Revenue from ${startDate} to ${endDate}: ${totalRevenue.toFixed(2)} (${searchResult.total_count} orders)` }] };
  }
}

// --- Vercel Handler Logic ---
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