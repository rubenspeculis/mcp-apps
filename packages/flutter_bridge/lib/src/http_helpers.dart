import 'dart:convert';

Object? decodeMcpHttpBody(List<int> bytes) {
  if (bytes.isEmpty) return null;
  final text = utf8.decode(bytes);
  if (text.trim().isEmpty) return null;
  try {
    return jsonDecode(text);
  } catch (_) {
    return text;
  }
}

Map<String, dynamic> defaultMcpHttpArguments(Object? decodedBody) {
  if (decodedBody == null) return <String, dynamic>{};
  if (decodedBody is Map<String, dynamic>) return decodedBody;
  if (decodedBody is Map) {
    return decodedBody.map((key, value) => MapEntry(key.toString(), value));
  }
  return <String, dynamic>{'body': decodedBody};
}
