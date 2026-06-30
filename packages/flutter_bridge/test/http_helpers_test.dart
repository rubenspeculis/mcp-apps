import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mcpapps_bridge/src/http_helpers.dart';

void main() {
  group('decodeMcpHttpBody', () {
    test('returns null for empty or whitespace bodies', () {
      expect(decodeMcpHttpBody(<int>[]), isNull);
      expect(decodeMcpHttpBody(utf8.encode('   ')), isNull);
    });

    test('decodes JSON bodies', () {
      expect(decodeMcpHttpBody(utf8.encode('{"city":"London"}')), {
        'city': 'London',
      });
    });

    test('falls back to text for non-JSON bodies', () {
      expect(decodeMcpHttpBody(utf8.encode('not-json')), 'not-json');
    });
  });

  group('defaultMcpHttpArguments', () {
    test('uses an empty object for empty request bodies', () {
      expect(defaultMcpHttpArguments(null), <String, dynamic>{});
    });

    test('passes JSON object bodies through', () {
      expect(defaultMcpHttpArguments({'city': 'Paris'}), {'city': 'Paris'});
    });

    test('stringifies non-string map keys', () {
      expect(defaultMcpHttpArguments({1: 'one'}), {'1': 'one'});
    });

    test('wraps primitive bodies', () {
      expect(defaultMcpHttpArguments('raw'), {'body': 'raw'});
    });
  });
}
