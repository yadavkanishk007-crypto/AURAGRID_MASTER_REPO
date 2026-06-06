import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/spatial_control/data/models/node_model.dart';

void main() {
  group('NodeModel Unit Tests', () {
    test('should parse from JSON correctly', () {
      final json = {
        'name': 'Sharavathi Hydro Hub',
        'initial_volume': 800.0,
        'max_capacity': 1500.0,
        'min_capacity': 20.0,
        'current_volume': 850.0,
        'status': 'NORMAL',
      };

      final model = NodeModel.fromJson(json);

      expect(model.name, 'Sharavathi Hydro Hub');
      expect(model.initialVolume, 800.0);
      expect(model.maxCapacity, 1500.0);
      expect(model.minCapacity, 20.0);
      expect(model.currentVolume, 850.0);
      expect(model.status, 'NORMAL');
    });

    test('should convert to JSON correctly', () {
      const model = NodeModel(
        name: 'Koramangala Residential',
        initialVolume: 500.0,
        maxCapacity: 1000.0,
        minCapacity: 20.0,
        currentVolume: 450.0,
        status: 'WARNING',
      );

      final json = model.toJson();

      expect(json['name'], 'Koramangala Residential');
      expect(json['initial_volume'], 500.0);
      expect(json['max_capacity'], 1000.0);
      expect(json['min_capacity'], 20.0);
      expect(json['current_volume'], 450.0);
      expect(json['status'], 'WARNING');
    });
  });
}
