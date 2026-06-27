import 'package:flutter/material.dart';
import 'package:mcpapps_bridge/mcpapps_bridge.dart';

import 'generated/models.dart';

void main() => runMcpApp(const WeatherApp());

class WeatherApp extends StatelessWidget {
  const WeatherApp({super.key});

  @override
  Widget build(BuildContext context) {
    final dark = McpApp.of(context).colorScheme == 'dark';
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: ThemeData(brightness: dark ? Brightness.dark : Brightness.light),
      home: const Scaffold(
        backgroundColor: Colors.transparent,
        body: Center(child: WeatherCard()),
      ),
    );
  }
}

class WeatherCard extends StatelessWidget {
  const WeatherCard({super.key});

  @override
  Widget build(BuildContext context) {
    final mcp = McpApp.of(context);
    final raw = mcp.result;
    if (raw == null) {
      return const Text('Waiting for weather…');
    }

    // Typed model generated from the zod schema by @mcpapps/typegen.
    final data = GetWeatherOutput.fromJson(raw);
    final tempC = data.tempC.round();
    final condition = data.condition;
    final hourly = data.hourly;
    final peak = hourly.map((h) => h.tempC).fold<double>(1, (a, b) => a > b ? a : b);

    return Container(
      width: 420,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: const Color(0xFFF6F7FB),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('$tempC°',
                      style: const TextStyle(
                          fontSize: 44, fontWeight: FontWeight.bold, color: Color(0xFF11131A))),
                  Text(condition, style: const TextStyle(color: Color(0xFF6B7280))),
                ],
              ),
              FilledButton(
                onPressed: () => mcp.callTool('get_weather', {'city': 'London'}),
                child: const Text('Refresh'),
              ),
            ],
          ),
          const SizedBox(height: 18),
          SizedBox(
            height: 110,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                for (final h in hourly)
                  Expanded(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        Container(
                          height: (h.tempC / peak) * 90 + 4,
                          margin: const EdgeInsets.symmetric(horizontal: 5),
                          decoration: BoxDecoration(
                            gradient: const LinearGradient(
                              begin: Alignment.bottomCenter,
                              end: Alignment.topCenter,
                              colors: [Color(0xFF6366F1), Color(0xFFA855F7)],
                            ),
                            borderRadius: BorderRadius.circular(6),
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text('${h.hour}h',
                            style: const TextStyle(fontSize: 11, color: Color(0xFF6B7280))),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
