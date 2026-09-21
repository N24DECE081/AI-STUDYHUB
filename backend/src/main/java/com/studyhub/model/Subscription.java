package com.studyhub.model;
import jakarta.persistence.*;
@Entity @Table(name="subscriptions", uniqueConstraints=@UniqueConstraint(columnNames="userId"))
public class Subscription { @Id @GeneratedValue(strategy=GenerationType.IDENTITY) private Long id; @Column(nullable=false,unique=true) private Long userId; @Column(nullable=false) private String plan="free"; @Column(nullable=false) private String status="active"; public Long getUserId(){return userId;} public void setUserId(Long v){userId=v;} public String getPlan(){return plan;} public void setPlan(String v){plan=v;} public String getStatus(){return status;} public void setStatus(String v){status=v;} }
