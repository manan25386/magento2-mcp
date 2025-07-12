// api/mcp.js - Vercel serverless function wrapper
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import https from "https";

// Disable SSL verification if needed. WARNING: Not recommended for production.
const httpsAgent = new https.Agent({
  rejectUnauthorized: process.env.NODE_ENV === 'production', // Only enable in production
});

class Magento2MCPServer {
  constructor() {
    console.log("👷 Initializing Magento2MCPServer...");

    this.baseUrl = process.env.MAGENTO_BASE_URL;
    this.apiToken = process.env.MAGENTO_API_TOKEN;

    console.log("MAGENTO_BASE_URL =", this.baseUrl);
    console.log("MAGENTO_API_TOKEN =", this.apiToken ? "Token loaded" : "Token MISSING");

    if (!this.baseUrl || !this.apiToken) {
      throw new Error("Missing required environment variables: MAGENTO_BASE_URL and MAGENTO_API_TOKEN must be set.");
    }

    this.server = new Server(
      {
        name: "magento2-mcp-server-vercel",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    console.log("🧩 Registering tool handlers...");
    this.setupToolHandlers();
  }

  async callMagentoApi(endpoint, method = "GET", data = null) {
    const url = `${this.baseUrl}/${endpoint}`;
    const config = {
      method,
      url,
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
      },
      httpsAgent,
      data: data
    };

    try {
      const response = await axios(config);
      return response.data;
    } catch (error) {
      console.error(`Magento API call to ${url} failed: ${error.message}`);
      // Log more details from Axios error if available
      if (error.response) {
        console.error('Error Response Data:', error.response.data);
        console.error('Error Response Status:', error.response.status);
      }
      throw new Error(`Magento API Error: ${error.message}`);
    }
  }

// CORRECTED VERSION
setupToolHandlers() {
    console.log("🧩 Registering tool handlers...");

    // CORRECT: Use ListToolsRequestSchema for listing tools.
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      console.log("MCP Request Received: tools/list");
      return {
        tools: [
          { name: "get_product_by_sku", description: "Get detailed information about a product by its SKU.", inputSchema: { type: "object", properties: { sku: { type: "string" } }, required: ["sku"] } },
          { name: "get_order_status", description: "Get order status by order ID.", inputSchema: { type: "object", properties: { orderId: { type: "string" } }, required: ["orderId"] } },
          { name: "search_products", description: "Search for products using Magento search criteria.", inputSchema: { type: "object", properties: { searchCriteria: { type: "object" } }, required: ["searchCriteria"] } },
          { name: "get_customer_ordered_products_by_email", description: "Get all ordered products for a customer by email.", inputSchema: { type: "object", properties: { email: { type: "string" } }, required: ["email"] } },
          { name: "get_order_count", description: "Get the number of orders for a date range.", inputSchema: { type: "object", properties: { startDate: { type: "string" }, endDate: { type: "string" } }, required: ["startDate", "endDate"] } },
          { name: "get_revenue", description: "Get the total revenue for a date range.", inputSchema: { type: "object", properties: { startDate: { type: "string" }, endDate: { type: "string" } }, required: ["startDate", "endDate"] } }
        ]
      };
    });

    // CORRECT: This handler for calling tools was already correct and remains.
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      console.log(`MCP Request Received: tools/call - Tool: ${name}`, args);

      try {
        switch (name) {
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
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        console.error(`Error executing tool '${name}':`, error);
        return { content: [{ type: "text", text: `Error: ${error.message}` }] };
      }
    });
  }
  // --- Tool Implementation Methods ---
  
  async getProductBySku(sku) {
    const product = await this.callMagentoApi(`products/${encodeURIComponent(sku)}`);
    return { content: [{ type: "text", text: JSON.stringify(product, null, 2) }] };
  }

  async getOrderStatus(orderId) {
    // First try to get order by entity_id
    try {
        const order = await this.callMagentoApi(`orders/${orderId}`);
        return this.formatOrderResponse(order);
    } catch (error) {
        // If that fails, search by increment_id
        console.log(`Order ${orderId} not found by entity_id, searching by increment_id.`);
        const searchResult = await this.callMagentoApi(
          `orders?searchCriteria[filterGroups][0][filters][0][field]=increment_id&searchCriteria[filterGroups][0][filters][0][value]=${orderId}&searchCriteria[filterGroups][0][filters][0][conditionType]=eq`
        );
        if (searchResult.items && searchResult.items.length > 0) {
            return this.formatOrderResponse(searchResult.items[0]);
        }
        throw new Error(`Order not found with ID or Increment ID: ${orderId}`);
    }
  }

  formatOrderResponse(order) {
    return {
        content: [{
            type: "text",
            text: `Order Status:\n- ID: ${order.entity_id}\n- Increment ID: ${order.increment_id}\n- Status: ${order.status}\n- State: ${order.state}\n- Total: ${order.grand_total} ${order.order_currency_code}\n- Customer: ${order.customer_email || 'N/A'}`
        }]
    };
  }
  
  // ... (rest of your tool methods: searchProducts, etc. They are mostly fine)
  // Make sure they correctly `throw` errors on failure to be caught by the handler.
  async searchProducts(searchCriteria) {
    try {
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
    } catch (error) { throw new Error(`Failed to search products: ${error.message}`); }
  }

  async getCustomerOrderedProductsByEmail(email) {
     try {
      const customerResult = await this.callMagentoApi(`customers/search?searchCriteria[filterGroups][0][filters][0][field]=email&searchCriteria[filterGroups][0][filters][0][value]=${email}&searchCriteria[filterGroups][0][filters][0][conditionType]=eq`);
      if (!customerResult.items || customerResult.items.length === 0) { throw new Error(`Customer not found with email: ${email}`); }
      const customer = customerResult.items[0];
      const ordersResult = await this.callMagentoApi(`orders?searchCriteria[filterGroups][0][filters][0][field]=customer_id&searchCriteria[filterGroups][0][filters][0][value]=${customer.id}&searchCriteria[filterGroups][0][filters][0][conditionType]=eq`);
      return { content: [{ type: "text", text: JSON.stringify({ customer, orders: ordersResult.items }, null, 2) }] };
     } catch (error) { throw new Error(`Failed to get customer orders: ${error.message}`); }
  }

  async getOrderCount(startDate, endDate) {
    try {
      const searchResult = await this.callMagentoApi(`orders?searchCriteria[filterGroups][0][filters][0][field]=created_at&searchCriteria[filterGroups][0][filters][0][value]=${startDate}&searchCriteria[filterGroups][0][filters][0][conditionType]=gteq&searchCriteria[filterGroups][0][filters][1][field]=created_at&searchCriteria[filterGroups][0][filters][1][value]=${endDate}&searchCriteria[filterGroups][0][filters][1][conditionType]=lteq`);
      return { content: [{ type: "text", text: `Order count from ${startDate} to ${endDate}: ${searchResult.total_count}` }] };
    } catch (error) { throw new Error(`Failed to get order count: ${error.message}`); }
  }

  async getRevenue(startDate, endDate) {
    try {
      const searchResult = await this.callMagentoApi(`orders?searchCriteria[filterGroups][0][filters][0][field]=created_at&searchCriteria[filterGroups][0][filters][0][value]=${startDate}&searchCriteria[filterGroups][0][filters][0][conditionType]=gteq&searchCriteria[filterGroups][0][filters][1][field]=created_at&searchCriteria[filterGroups][0][filters][1][value]=${endDate}&searchCriteria[filterGroups][0][filters][1][conditionType]=lteq`);
      const totalRevenue = searchResult.items.reduce((sum, order) => sum + parseFloat(order.grand_total || 0), 0);
      return { content: [{ type: "text", text: `Revenue from ${startDate} to ${endDate}: ${totalRevenue.toFixed(2)} (${searchResult.total_count} orders)` }] };
    } catch (error) { throw new Error(`Failed to get revenue: ${error.message}`); }
  }
}

// Instantiate the server ONCE outside the handler.
// This instance will be reused across invocations of the serverless function.
const mcpServer = new Magento2MCPServer();

// The main Vercel serverless function handler
// The main Vercel serverless function handler
export default async function handler(req, res) {
  // Set CORS headers for all responses
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-MCP-Version');

  // Handle pre-flight CORS requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // A simple health check for GET requests
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'online',
      message: 'MCP server is running. Use POST for MCP methods.'
    });
  }

  // Handle MCP methods via POST
  if (req.method === 'POST') {
    try {
      // The body of the POST request is the MCP request object.
      // Vercel automatically parses the JSON body into `req.body`.
      const mcpRequest = req.body;
      
      console.log("Received MCP Request:", JSON.stringify(mcpRequest, null, 2));

      // Pass the entire request object to the MCP server's .request() method.
      const mcpResponse = await mcpServer.server.request(mcpRequest);

      console.log("Sending MCP Response:", JSON.stringify(mcpResponse, null, 2));

      // The SDK returns the complete response object, which we send back as JSON.
      return res.status(200).json(mcpResponse);

    } catch (error) {
      console.error("Error processing MCP request:", error);
      // If an unexpected error occurs, return a standard server error.
      return res.status(500).json({
        error: 'An internal error occurred',
        message: error.message
      });
    }
  }

  // If the method is not GET, POST, or OPTIONS, it's not allowed.
  return res.status(405).json({ error: 'Method Not Allowed' });
}
