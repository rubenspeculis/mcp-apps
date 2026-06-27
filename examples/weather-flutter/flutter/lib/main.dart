import 'package:flutter/material.dart';
import 'package:mcpapps_bridge/mcpapps_bridge.dart';

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
    final result = mcp.result;
    if (result == null) {
      return const Text('Waiting for weather…');
    }

    final tempC = (result['tempC'] as num).round();
    final condition = result['condition'] as String;
    final hourly = (result['hourly'] as List).cast<Map<String, dynamic>>();
    final peak = hourly
        .map((h) => (h['tempC'] as num).toDouble())
        .fold<double>(1, (a, b) => a > b ? a : b);

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
                          height: ((h['tempC'] as num).toDouble() / peak) * 90 + 4,
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
                        Text('${h['hour']}h',
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
