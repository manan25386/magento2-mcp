// api/mcp.js - Vercel serverless function wrapper
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import { z } from "zod";
import https from "https";

// Disable SSL verification for development (remove in production)
const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
});

class Magento2MCPServer {
  constructor() {
    this.baseUrl = process.env.MAGENTO_BASE_URL;
  this.apiToken = process.env.MAGENTO_API_TOKEN;

  console.log("MAGENTO_BASE_URL =", this.baseUrl);
  console.log("MAGENTO_API_TOKEN =", this.apiToken ? "Token loaded" : "Token MISSING");

  if (!this.baseUrl || !this.apiToken) {
    throw new Error("MAGENTO_BASE_URL and MAGENTO_API_TOKEN are required");
  }
    this.server = new Server(
      {
        name: "magento2-mcp-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.baseUrl = process.env.MAGENTO_BASE_URL;
    this.apiToken = process.env.MAGENTO_API_TOKEN;
    
    if (!this.baseUrl || !this.apiToken) {
      throw new Error("MAGENTO_BASE_URL and MAGENTO_API_TOKEN are required");
    }

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
    };

    if (data) {
      config.data = data;
    }

    try {
      const response = await axios(config);
      return response.data;
    } catch (error) {
      console.error(`API call failed: ${error.message}`);
      throw error;
    }
  }

  setupToolHandlers() {
    console.log("👷 Initializing Magento2MCPServer...");
    // List all available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
        console.log("🧩 Registering tool handlers...");
      return {
        tools: [
          {
            name: "get_product_by_sku",
            description: "Get detailed information about a product by its SKU",
            inputSchema: {
              type: "object",
              properties: {
                sku: { type: "string", description: "Product SKU" }
              },
              required: ["sku"]
            }
          },
          {
            name: "get_order_status",
            description: "Get order status by order ID",
            inputSchema: {
              type: "object",
              properties: {
                orderId: { type: "string", description: "Order ID or increment ID" }
              },
              required: ["orderId"]
            }
          },
          {
            name: "search_products",
            description: "Search for products using Magento search criteria",
            inputSchema: {
              type: "object",
              properties: {
                searchCriteria: {
                  type: "object",
                  description: "Search criteria with filters"
                }
              },
              required: ["searchCriteria"]
            }
          },
          {
            name: "get_customer_ordered_products_by_email",
            description: "Get all ordered products for a customer by email address",
            inputSchema: {
              type: "object",
              properties: {
                email: { type: "string", description: "Customer email address" }
              },
              required: ["email"]
            }
          },
          {
            name: "get_order_count",
            description: "Get the number of orders for a given date range",
            inputSchema: {
              type: "object",
              properties: {
                startDate: { type: "string", description: "Start date (YYYY-MM-DD) or relative date" },
                endDate: { type: "string", description: "End date (YYYY-MM-DD) or relative date" }
              },
              required: ["startDate", "endDate"]
            }
          },
          {
            name: "get_revenue",
            description: "Get the total revenue for a given date range",
            inputSchema: {
              type: "object",
              properties: {
                startDate: { type: "string", description: "Start date (YYYY-MM-DD) or relative date" },
                endDate: { type: "string", description: "End date (YYYY-MM-DD) or relative date" }
              },
              required: ["startDate", "endDate"]
            }
          }
        ]
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
         console.log("⚙️ MCP Tool Call Handler triggered");
        console.log("🛠 Tool:", request.params.name);
        console.log("📦 Arguments:", request.params.arguments);
      const { name, arguments: args } = request.params;

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
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error.message}`
            }
          ]
        };
      }
    });
  }

  async getProductBySku(sku) {
    try {
      const product = await this.callMagentoApi(`products/${encodeURIComponent(sku)}`);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(product, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to get product: ${error.message}`);
    }
  }

  async getOrderStatus(orderId) {
    try {
        console.log("Trying to get order by entity_id:", orderId);
      // First try to get order by entity_id
      let order;
      try {
        order = await this.callMagentoApi(`orders/${orderId}`);
        console.log("Order found by entity_id");
      } catch (error) {
        console.log("Failed by entity_id, trying increment_id");
        // If that fails, search by increment_id
        const searchResult = await this.callMagentoApi(
          `orders?searchCriteria[filterGroups][0][filters][0][field]=increment_id&searchCriteria[filterGroups][0][filters][0][value]=${orderId}&searchCriteria[filterGroups][0][filters][0][conditionType]=eq`
        );
        
        if (searchResult.items && searchResult.items.length > 0) {
          order = searchResult.items[0];
          console.log("Order found by increment_id");
        } else {
          throw new Error(`Order not found with ID: ${orderId}`);
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `Order Status Information:
- Order ID: ${order.entity_id}
- Increment ID: ${order.increment_id}
- Status: ${order.status}
- State: ${order.state}
- Grand Total: ${order.grand_total} ${order.order_currency_code}
- Customer Email: ${order.customer_email || 'N/A'}
- Created At: ${order.created_at}
- Updated At: ${order.updated_at}`
          }
        ]
      };
    } catch (error) {
        console.error("Error in getOrderStatus:", error);
      throw new Error(`Failed to get order status: ${error.message}`);
    }
  }

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
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(products, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to search products: ${error.message}`);
    }
  }

  async getCustomerOrderedProductsByEmail(email) {
    try {
      // First get customer by email
      const customerResult = await this.callMagentoApi(
        `customers/search?searchCriteria[filterGroups][0][filters][0][field]=email&searchCriteria[filterGroups][0][filters][0][value]=${email}&searchCriteria[filterGroups][0][filters][0][conditionType]=eq`
      );

      if (!customerResult.items || customerResult.items.length === 0) {
        throw new Error(`Customer not found with email: ${email}`);
      }

      const customer = customerResult.items[0];
      
      // Get orders for this customer
      const ordersResult = await this.callMagentoApi(
        `orders?searchCriteria[filterGroups][0][filters][0][field]=customer_id&searchCriteria[filterGroups][0][filters][0][value]=${customer.id}&searchCriteria[filterGroups][0][filters][0][conditionType]=eq`
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              customer: customer,
              orders: ordersResult.items
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to get customer orders: ${error.message}`);
    }
  }

  async getOrderCount(startDate, endDate) {
    try {
      const searchResult = await this.callMagentoApi(
        `orders?searchCriteria[filterGroups][0][filters][0][field]=created_at&searchCriteria[filterGroups][0][filters][0][value]=${startDate}&searchCriteria[filterGroups][0][filters][0][conditionType]=gteq&searchCriteria[filterGroups][0][filters][1][field]=created_at&searchCriteria[filterGroups][0][filters][1][value]=${endDate}&searchCriteria[filterGroups][0][filters][1][conditionType]=lteq`
      );

      return {
        content: [
          {
            type: "text",
            text: `Order count from ${startDate} to ${endDate}: ${searchResult.total_count}`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to get order count: ${error.message}`);
    }
  }

  async getRevenue(startDate, endDate) {
    try {
      const searchResult = await this.callMagentoApi(
        `orders?searchCriteria[filterGroups][0][filters][0][field]=created_at&searchCriteria[filterGroups][0][filters][0][value]=${startDate}&searchCriteria[filterGroups][0][filters][0][conditionType]=gteq&searchCriteria[filterGroups][0][filters][1][field]=created_at&searchCriteria[filterGroups][0][filters][1][value]=${endDate}&searchCriteria[filterGroups][0][filters][1][conditionType]=lteq`
      );

      const totalRevenue = searchResult.items.reduce((sum, order) => sum + parseFloat(order.grand_total || 0), 0);

      return {
        content: [
          {
            type: "text",
            text: `Revenue from ${startDate} to ${endDate}: ${totalRevenue.toFixed(2)} (${searchResult.total_count} orders)`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to get revenue: ${error.message}`);
    }
  }
}

// Vercel serverless function handler
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'GET') {
    res.status(200).json({
      message: 'Magento 2 MCP Server is running on Vercel',
      version: '1.0.0',
      tools: [
        'get_product_by_sku',
        'get_order_status',
        'search_products',
        'get_customer_ordered_products_by_email',
        'get_order_count',
        'get_revenue'
      ]
    });
    return;
  }

  if (req.method === 'POST') {
    try {
        console.log("Received POST request:", req.body);

      const server = new Magento2MCPServer();
      const { tool, arguments: args } = req.body;

      // Handle MCP tool calls
      const result = await server.server.request({
        method: 'tools/call',
        params: {
          name: tool,
          arguments: args
        }
      });

      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({
        error: error.message
      });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}