import { ArrayMinSize, IsArray, IsString } from "class-validator";

export class ReorderNodesDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  nodeIds!: string[];
}

