// api/mcp.js - Vercel Serverless Function
import axios from "axios";
import https from "https";
import { format, parseISO, isValid, subDays, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear } from 'date-fns';

// --- Helper Functions from your mcp-server.js ---

function parseDateExpression(dateExpression) {
  const now = new Date();
  const normalizedExpression = dateExpression.toLowerCase().trim();
  switch (normalizedExpression) {
    case 'today': return { startDate: startOfDay(now), endDate: endOfDay(now), description: 'Today' };
    case 'yesterday': const y = subDays(now, 1); return { startDate: startOfDay(y), endDate: endOfDay(y), description: 'Yesterday' };
    case 'this week': return { startDate: startOfWeek(now, { weekStartsOn: 1 }), endDate: endOfDay(now), description: 'This week' };
    case 'last week': const lws = subDays(startOfWeek(now, { weekStartsOn: 1 }), 7); const lwe = subDays(endOfWeek(now, { weekStartsOn: 1 }), 7); return { startDate: lws, endDate: lwe, description: 'Last week' };
    case 'this month': return { startDate: startOfMonth(now), endDate: endOfDay(now), description: 'This month' };
    case 'last month': const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1); return { startDate: startOfMonth(lm), endDate: endOfMonth(lm), description: 'Last month' };
    case 'ytd': return { startDate: startOfYear(now), endDate: endOfDay(now), description: 'Year to date' };
    default:
      const rangeParts = normalizedExpression.split(' to ');
      if (rangeParts.length === 2) {
        const startDate = parseISO(rangeParts[0]);
        const endDate = parseISO(rangeParts[1]);
        if (isValid(startDate) && isValid(endDate)) return { startDate: startOfDay(startDate), endDate: endOfDay(endDate), description: `${format(startDate, 'yyyy-MM-dd')} to ${format(endDate, 'yyyy-MM-dd')}` };
      }
      throw new Error(`Unable to parse date expression: ${dateExpression}`);
  }
}

function formatDateForMagento(date) {
  return format(date, "yyyy-MM-dd HH:mm:ss");
}

// --- Main Server Class (Holds our logic) ---
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
  async callTool(toolName, args) {
    console.log(`Manually calling tool: ${toolName}`, args);
    // Add all your tools from mcp-server.js here
    switch (toolName) {
      case "get_product_by_sku": return this.getProductBySku(args.sku);
      case "get_revenue": return this.getRevenue(args);
      case "get_order_count": return this.getOrderCount(args);
      case "get_product_sales": return this.getProductSales(args);
      // We will add get_order_status later, as it was not in your new file.
      default: throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  listTools() {
    return {
      tools: [
        { name: "get_product_by_sku", description: "Get detailed information about a product by its SKU." },
        { name: "get_revenue", description: "Get the total revenue for a given date range." },
        { name: "get_order_count", description: "Get the number of orders for a given date range." },
        { name: "get_product_sales", description: "Get statistics about products sold in a date range." },
      ]
    };
  }

  // --- Core Methods ---
  
  // CORRECTED version from your mcp-server.js
  async callMagentoApi(endpoint, method = 'GET', data = null) {
    const url = `${this.baseUrl}/${endpoint}`;
    const headers = { 'Authorization': `Bearer ${this.apiToken}`, 'Content-Type': 'application/json' };
    const config = {
      method,
      url,
      headers,
      data: data ? JSON.stringify(data) : undefined, // THIS IS THE CRITICAL FIX
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
    };
    try {
      const response = await axios(config);
      return response.data;
    } catch (error) {
      console.error(`Magento API Error calling ${url}:`, error.response?.data || error.message);
      throw new Error(`Magento API Error: ${error.response?.data?.message || error.message}`);
    }
  }

  async fetchAllPages(endpoint, baseSearchCriteria) {
    let currentPage = 1;
    let allItems = [];
    do {
      const pagedCriteria = `${baseSearchCriteria}&searchCriteria[pageSize]=100&searchCriteria[currentPage]=${currentPage}`;
      const responseData = await this.callMagentoApi(`${endpoint}?${pagedCriteria}`);
      if (responseData.items && Array.isArray(responseData.items)) {
        allItems = allItems.concat(responseData.items);
      }
      if (!responseData.items || responseData.items.length < 100) {
        break;
      }
      currentPage++;
    } while (true);
    return allItems;
  }

  // --- Tool Logic (Ported from mcp-server.js) ---

  async getProductBySku(sku) {
    const productData = await this.callMagentoApi(`products/${encodeURIComponent(sku)}`);
    return { content: [{ type: "text", text: JSON.stringify(productData, null, 2) }] };
  }

  async getRevenue({ date_range, status }) {
    const dateRange = parseDateExpression(date_range);
    const startDate = formatDateForMagento(dateRange.startDate);
    const endDate = formatDateForMagento(dateRange.endDate);
    
    let searchCriteria = `searchCriteria[filter_groups][0][filters][0][field]=created_at&searchCriteria[filter_groups][0][filters][0][value]=${encodeURIComponent(startDate)}&searchCriteria[filter_groups][0][filters][0][condition_type]=gteq` +
                         `&searchCriteria[filter_groups][1][filters][0][field]=created_at&searchCriteria[filter_groups][1][filters][0][value]=${encodeURIComponent(endDate)}&searchCriteria[filter_groups][1][filters][0][condition_type]=lteq`;

    if (status) {
      searchCriteria += `&searchCriteria[filter_groups][2][filters][0][field]=status&searchCriteria[filter_groups][2][filters][0][value]=${encodeURIComponent(status)}&searchCriteria[filter_groups][2][filters][0][condition_type]=eq`;
    }

    const allOrders = await this.fetchAllPages('orders', searchCriteria);
    const totalRevenue = allOrders.reduce((sum, order) => sum + parseFloat(order.grand_total || 0), 0);

    const result = {
      query: { date_range: dateRange.description, status: status || 'All' },
      result: { revenue: parseFloat(totalRevenue.toFixed(2)), order_count: allOrders.length }
    };
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  async getOrderCount({ date_range, status }) {
    // This logic is simplified as fetchAllPages will get the full count.
    // We can reuse getRevenue's logic for this.
    const revenueData = await this.getRevenue({ date_range, status });
    const parsedResult = JSON.parse(revenueData.content[0].text);
    const result = {
      query: parsedResult.query,
      result: { order_count: parsedResult.result.order_count }
    };
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
  
  async getProductSales({ date_range, status }) {
    const dateRange = parseDateExpression(date_range);
    const startDate = formatDateForMagento(dateRange.startDate);
    const endDate = formatDateForMagento(dateRange.endDate);

    let searchCriteria = `searchCriteria[filter_groups][0][filters][0][field]=created_at&searchCriteria[filter_groups][0][filters][0][value]=${encodeURIComponent(startDate)}&searchCriteria[filter_groups][0][filters][0][condition_type]=gteq` +
                         `&searchCriteria[filter_groups][1][filters][0][field]=created_at&searchCriteria[filter_groups][1][filters][0][value]=${encodeURIComponent(endDate)}&searchCriteria[filter_groups][1][filters][0][condition_type]=lteq`;
    
    if (status) {
      searchCriteria += `&searchCriteria[filter_groups][2][filters][0][field]=status&searchCriteria[filter_groups][2][filters][0][value]=${encodeURIComponent(status)}&searchCriteria[filter_groups][2][filters][0][condition_type]=eq`;
    }

    const allOrders = await this.fetchAllPages('orders', searchCriteria);
    let productCounts = {};
    allOrders.forEach(order => {
        order.items?.forEach(item => {
            if (item.sku) {
                if (!productCounts[item.sku]) productCounts[item.sku] = { name: item.name, quantity: 0, revenue: 0 };
                productCounts[item.sku].quantity += parseFloat(item.qty_ordered || 0);
                productCounts[item.sku].revenue += parseFloat(item.row_total || 0);
            }
        });
    });

    const topProducts = Object.entries(productCounts).map(([sku, data]) => ({ sku, ...data })).sort((a,b) => b.quantity - a.quantity).slice(0, 10);
    return { content: [{ type: "text", text: JSON.stringify({ query: { date_range: dateRange.description, status: status || 'All' }, result: { top_products: topProducts }}, null, 2) }] };
  }
}

// --- Vercel Handler (Unchanged from our working manual version) ---
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
      const { name, arguments: args } = mcpRequest.params;
      const result = await mcpLogic.callTool(name, args);
      mcpResponse = { mcp_version: "1.0", request_id: mcpRequest.request_id, result: result };
      console.log("Sending MCP Response:", JSON.stringify(mcpResponse, null, 2));
      return res.status(200).json(mcpResponse);
    } catch (error) {
      console.error("Error processing MCP request:", error);
      mcpResponse = { mcp_version: "1.0", error: { code: -32603, message: error.message } };
      return res.status(500).json(mcpResponse);
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}