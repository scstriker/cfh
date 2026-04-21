import { MAPPING_TYPES, type MappingType } from "@/lib/types";

const mappingTypeSet = new Set<string>(MAPPING_TYPES);

export function normalizeMappingType(value: string | undefined | null): MappingType {
  if (value && mappingTypeSet.has(value)) {
    return value as MappingType;
  }
  return "related";
}
