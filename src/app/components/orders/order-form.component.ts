import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { UpperCasePipe } from '@angular/common';
import { FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { UiButtonComponent } from '@/components/ui/button';
import { UiInputDirective } from '@/components/ui/input';
import {
  PlacesAutocompleteDirective,
  type PlaceResult,
} from '../../shared/directives/places-autocomplete.directive';
import type { OrderCargoInventory, OrderVehicleType } from '../../core/models/order.model';
import {
  CARGO_INVENTORY_CATEGORIES,
  vehicleRecommendationCopy,
} from '../../shared/utils/order-cargo-scoring.util';
import {
  ORDER_FLOOR_OPTIONS,
  ORDER_LABEL_CLASS,
  ORDER_LABEL_SUB_CLASS,
  ORDER_MAP_BTN_ACTIVE,
  ORDER_MAP_BTN_IDLE,
  ORDER_SELECT_CLASS,
} from './order-form.constants';

@Component({
  selector: 'app-order-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    LucideAngularModule,
    UiButtonComponent,
    UiInputDirective,
    PlacesAutocompleteDirective,
    UpperCasePipe,
  ],
  templateUrl: './order-form.component.html',
  styleUrl: './order-form.component.css',
})
export class OrderFormComponent {
  readonly floorOptions = ORDER_FLOOR_OPTIONS;
  readonly labelClass = ORDER_LABEL_CLASS;
  readonly labelSubClass = ORDER_LABEL_SUB_CLASS;
  readonly selectClass = ORDER_SELECT_CLASS;
  readonly mapBtnActive = ORDER_MAP_BTN_ACTIVE;
  readonly mapBtnIdle = ORDER_MAP_BTN_IDLE;
  readonly inventoryCategories = CARGO_INVENTORY_CATEGORIES;

  readonly logisticsForm = input.required<FormGroup>();

  readonly error = input('');
  readonly createErrorFromStore = input<string | null>(null);
  readonly cyprusPickupDistricts = input<string[]>([]);
  readonly pickupDistrict = input('');
  readonly pickupAddressText = input('');
  readonly dropoffAddressText = input('');
  readonly pickupLocationSet = input(false);
  readonly dropoffLocationSet = input(false);
  readonly hasRoutePoints = input(false);
  readonly scheduledDate = input('');
  readonly scheduledTime = input('');
  readonly minDate = input('');
  readonly timeSlots = input<string[]>([]);
  readonly cargoInventory = input<OrderCargoInventory>({
    boxes: 0,
    mediumItems: 0,
    largeFurniture: 0,
    heavyAppliances: 0,
  });
  readonly cargoScore = input(0);
  readonly assignedVehicleType = input<OrderVehicleType>('pickup');
  readonly totalCargoItems = input(0);
  readonly cargoFile = input<File | null>(null);

  readonly vehicleBanner = computed(() => vehicleRecommendationCopy(this.assignedVehicleType()));

  readonly pickupDistrictChange = output<string>();
  readonly pickupAddressTextChange = output<string>();
  readonly dropoffAddressTextChange = output<string>();
  readonly pickupPlaceSelected = output<PlaceResult>();
  readonly dropoffPlaceSelected = output<PlaceResult>();
  readonly clearPickupLocation = output<void>();
  readonly clearDropoffLocation = output<void>();
  readonly clearPoints = output<void>();
  readonly scheduledDateChange = output<string>();
  readonly scheduledTimeChange = output<string>();
  readonly cargoInventoryChange = output<{ key: keyof OrderCargoInventory; value: number }>();
  readonly incrementCargoItem = output<keyof OrderCargoInventory>();
  readonly decrementCargoItem = output<keyof OrderCargoInventory>();
  readonly cargoFileChange = output<Event>();

  quantityFor(key: keyof OrderCargoInventory): number {
    return this.cargoInventory()[key] ?? 0;
  }
}
