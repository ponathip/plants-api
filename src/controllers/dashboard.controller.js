import { db } from "../config/db.js";

function buildGardenWhere({ alias = "", gardenId, isSuper, scope }) {
  const prefix = alias ? `${alias}.` : "";
  let where = "";
  const params = [];

  if (!(isSuper && scope === "all")) {
    where += ` AND ${prefix}garden_id = ?`;
    params.push(gardenId);
  }

  return { where, params };
}

export async function getProfitDashboard(req, reply) {
  try {
    const { gardenId, isSuper, scope } = req.gardenContext;
    const { from, to } = req.query;

    const dateFrom = from || "2000-01-01";
    const dateTo = to || "2099-12-31";

    const salesGarden = buildGardenWhere({
      alias: "s",
      gardenId,
      isSuper,
      scope,
    });

    const expenseGarden = buildGardenWhere({
      alias: "e",
      gardenId,
      isSuper,
      scope,
    });

    const [[saleSummary]] = await db.query(
      `SELECT
        COALESCE(SUM(s.grand_total), 0) AS revenue_total,
        COALESCE(SUM(si.cost_total_snapshot), 0) AS cost_total,
        COALESCE(SUM(si.profit_total), 0) AS profit_total,
        COUNT(DISTINCT s.id) AS sale_count
       FROM sales s
       LEFT JOIN sale_items si ON si.sale_id = s.id
       WHERE s.deleted_at IS NULL
         AND DATE(s.sold_at) BETWEEN ? AND ?
         ${salesGarden.where}`,
      [dateFrom, dateTo, ...salesGarden.params]
    );

    const [[expenseSummary]] = await db.query(
      `SELECT
        COALESCE(SUM(e.amount), 0) AS expense_total
       FROM expenses e
       WHERE e.deleted_at IS NULL
         AND DATE(e.expense_date) BETWEEN ? AND ?
         ${expenseGarden.where}`,
      [dateFrom, dateTo, ...expenseGarden.params]
    );

    const revenueTotal = Number(saleSummary?.revenue_total || 0);
    const costTotal = Number(saleSummary?.cost_total || 0);
    const grossProfitTotal = Number(saleSummary?.profit_total || 0);
    const expenseTotal = Number(expenseSummary?.expense_total || 0);
    const netProfitTotal = grossProfitTotal - expenseTotal;

    const [salesDaily] = await db.query(
      `SELECT
        DATE(s.sold_at) AS date,
        COALESCE(SUM(s.grand_total), 0) AS revenue_total,
        COALESCE(SUM(si.cost_total_snapshot), 0) AS cost_total,
        COALESCE(SUM(si.profit_total), 0) AS gross_profit_total,
        COUNT(DISTINCT s.id) AS sale_count
       FROM sales s
       LEFT JOIN sale_items si ON si.sale_id = s.id
       WHERE s.deleted_at IS NULL
         AND DATE(s.sold_at) BETWEEN ? AND ?
         ${salesGarden.where}
       GROUP BY DATE(s.sold_at)
       ORDER BY DATE(s.sold_at) ASC`,
      [dateFrom, dateTo, ...salesGarden.params]
    );

    const [expensesDaily] = await db.query(
      `SELECT
        DATE(e.expense_date) AS date,
        COALESCE(SUM(e.amount), 0) AS expense_total
       FROM expenses e
       WHERE e.deleted_at IS NULL
         AND DATE(e.expense_date) BETWEEN ? AND ?
         ${expenseGarden.where}
       GROUP BY DATE(e.expense_date)
       ORDER BY DATE(e.expense_date) ASC`,
      [dateFrom, dateTo, ...expenseGarden.params]
    );

    const dailyMap = new Map();

    for (const row of salesDaily) {
      dailyMap.set(row.date, {
        date: row.date,
        revenue_total: Number(row.revenue_total || 0),
        cost_total: Number(row.cost_total || 0),
        gross_profit_total: Number(row.gross_profit_total || 0),
        expense_total: 0,
        net_profit_total: Number(row.gross_profit_total || 0),
        sale_count: Number(row.sale_count || 0),
      });
    }

    for (const row of expensesDaily) {
      const current = dailyMap.get(row.date) || {
        date: row.date,
        revenue_total: 0,
        cost_total: 0,
        gross_profit_total: 0,
        expense_total: 0,
        net_profit_total: 0,
        sale_count: 0,
      };

      current.expense_total = Number(row.expense_total || 0);
      current.net_profit_total =
        Number(current.gross_profit_total || 0) -
        Number(current.expense_total || 0);

      dailyMap.set(row.date, current);
    }

    const daily = Array.from(dailyMap.values()).sort((a, b) =>
      String(a.date).localeCompare(String(b.date))
    );

    const [recentSales] = await db.query(
      `SELECT
        s.id,
        s.buyer_name,
        s.channel,
        s.grand_total,
        s.sold_at
       FROM sales s
       WHERE s.deleted_at IS NULL
         AND DATE(s.sold_at) BETWEEN ? AND ?
         ${salesGarden.where}
       ORDER BY s.sold_at DESC
       LIMIT 5`,
      [dateFrom, dateTo, ...salesGarden.params]
    );

    const [recentExpenses] = await db.query(
      `SELECT
        e.id,
        e.category,
        e.title,
        e.amount,
        e.expense_date
       FROM expenses e
       WHERE e.deleted_at IS NULL
         AND DATE(e.expense_date) BETWEEN ? AND ?
         ${expenseGarden.where}
       ORDER BY e.expense_date DESC
       LIMIT 5`,
      [dateFrom, dateTo, ...expenseGarden.params]
    );

    return reply.send({
      summary: {
        revenue_total: revenueTotal,
        cost_total: costTotal,
        gross_profit_total: grossProfitTotal,
        expense_total: expenseTotal,
        net_profit_total: netProfitTotal,
        sale_count: Number(saleSummary?.sale_count || 0),
      },
      daily,
      recentSales,
      recentExpenses,
    });
  } catch (error) {
    console.error("getProfitDashboard error:", error);
    return reply.code(500).send({ message: "โหลด dashboard กำไรไม่สำเร็จ" });
  }
}

export async function getVarietyDashboard(req, reply) {
  try {
    const { gardenId, isSuper, scope } = req.gardenContext;
    const { from, to } = req.query;

    const dateFrom = from || "2000-01-01";
    const dateTo = to || "2099-12-31";

    const salesGarden = buildGardenWhere({
      alias: "s",
      gardenId,
      isSuper,
      scope,
    });

    const [rows] = await db.query(
      `SELECT
        pv.id AS variety_id,
        pv.name AS variety_name,
        ps.name AS species_name,
        COUNT(DISTINCT si.id) AS sale_item_count,
        COALESCE(SUM(si.quantity), 0) AS qty_sold,
        COALESCE(SUM(si.line_total), 0) AS revenue_total,
        COALESCE(SUM(si.cost_total_snapshot), 0) AS cost_total,
        COALESCE(SUM(si.profit_total), 0) AS profit_total
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       JOIN plants p ON p.id = si.plant_id
       LEFT JOIN plant_species ps ON ps.id = p.species_id
       LEFT JOIN plant_varieties pv ON pv.id = p.plant_variety_id
       WHERE s.deleted_at IS NULL
         AND DATE(s.sold_at) BETWEEN ? AND ?
         ${salesGarden.where}
       GROUP BY pv.id, pv.name, ps.name
       ORDER BY profit_total DESC`,
      [dateFrom, dateTo, ...salesGarden.params]
    );

    return reply.send(rows);
  } catch (error) {
    console.error("getVarietyDashboard error:", error);
    return reply.code(500).send({ message: "โหลด dashboard รายพันธุ์ไม่สำเร็จ" });
  }
}

export async function getStockSummary(req, reply) {
  try {
    const { gardenId, isSuper, scope } = req.gardenContext;

    const garden = buildGardenWhere({
      alias: "",
      gardenId,
      isSuper,
      scope,
    });

    const [[summary]] = await db.query(
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'alive' THEN 1 ELSE 0 END) AS alive,
        SUM(CASE WHEN status = 'sold' THEN 1 ELSE 0 END) AS sold,
        SUM(CASE WHEN status = 'dead' THEN 1 ELSE 0 END) AS dead
       FROM plants
       WHERE deleted_at IS NULL
       ${garden.where}`,
      [...garden.params]
    );

    return reply.send(summary);
  } catch (error) {
    console.error("getStockSummary error:", error);
    return reply.code(500).send({ message: "โหลด stock summary ไม่สำเร็จ" });
  }
}

export async function getStockByVariety(req, reply) {
  try {
    const { gardenId, isSuper, scope } = req.gardenContext;

    const garden = buildGardenWhere({
      alias: "p",
      gardenId,
      isSuper,
      scope,
    });

    const [rows] = await db.query(
      `SELECT
        ps.id AS species_id,
        ps.name AS species_name,
        pv.id AS variety_id,
        pv.name AS variety_name,
        COUNT(p.id) AS total_count,
        SUM(CASE WHEN p.status = 'alive' THEN 1 ELSE 0 END) AS alive_count,
        SUM(CASE WHEN p.status = 'sold' THEN 1 ELSE 0 END) AS sold_count,
        SUM(CASE WHEN p.status = 'dead' THEN 1 ELSE 0 END) AS dead_count
       FROM plants p
       LEFT JOIN plant_species ps ON ps.id = p.species_id
       LEFT JOIN plant_varieties pv ON pv.id = p.plant_variety_id
       WHERE p.deleted_at IS NULL
       ${garden.where}
       GROUP BY ps.id, ps.name, pv.id, pv.name
       ORDER BY alive_count DESC, total_count DESC`,
      [...garden.params]
    );

    return reply.send(rows);
  } catch (error) {
    console.error("getStockByVariety error:", error);
    return reply.code(500).send({ message: "โหลด stock by variety ไม่สำเร็จ" });
  }
}